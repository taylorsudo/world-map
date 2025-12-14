import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@notionhq/client';

const { NOTION_API_KEY, NOTION_DATABASE_ID, PORT = 3000 } = Bun.env;

const notion = NOTION_API_KEY ? new Client({ auth: NOTION_API_KEY }) : null;

const PUBLIC_DIR = path.dirname(fileURLToPath(import.meta.url));

const MIME_MAP = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

const RATE_LIMIT = {
    windowMs: 60_000, // 1 minute
    max: 120 // per IP per window
};
const hits = new Map();

function safeJoin(base, target) {
    const resolved = path.normalize(path.join(base, target));
    if (!resolved.startsWith(base)) {
        return null;
    }
    return resolved;
}

async function serveStatic(pathname) {
    const filePath = safeJoin(PUBLIC_DIR, pathname);
    if (!filePath) return null;

    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;

    const ext = path.extname(filePath);
    const headers = new Headers();
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    if (MIME_MAP[ext]) {
        headers.set('Content-Type', MIME_MAP[ext]);
    }
    // Cache static assets aggressively; HTML minimal to allow deploy updates
    if (ext === '.html' || ext === '.js') {
        headers.set('Cache-Control', 'no-cache');
    } else {
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }

    return new Response(file, { headers });
}

async function getNotionPlaces() {
    if (!notion || !NOTION_DATABASE_ID) {
        return {
            status: 500,
            body: {
                error: 'Notion API not configured',
                message: 'Please set NOTION_API_KEY and NOTION_DATABASE_ID in .env'
            }
        };
    }

    try {
        const response = await notion.databases.query({
            database_id: NOTION_DATABASE_ID,
        });

        const places = response.results.map(page => {
            const props = page.properties;
            const name = props.Name?.title?.[0]?.plain_text || 'Unnamed Place';
            const lat = props.Latitude?.number ?? null;
            const lng = props.Longitude?.number ?? null;
            const category = (props.Category?.select?.name || '').trim();
            const address = (props.Address?.rich_text || [])
                .map(textItem => textItem.plain_text)
                .join('')
                .trim();

            return {
                id: page.id,
                name,
                lat,
                lng,
                icon: category || 'Quest',
                description: address || category,
                category,
                address
            };
        }).filter(place => place.lat !== null && place.lng !== null);

        return { status: 200, body: { places, count: places.length } };
    } catch (error) {
        console.error('Error fetching Notion places:', error);
        return {
            status: 500,
            body: {
                error: 'Failed to fetch places from Notion',
                message: error.message
            }
        };
    }
}

async function getNotionPageContent(pageId) {
    if (!notion || !NOTION_DATABASE_ID) {
        return {
            status: 500,
            body: {
                error: 'Notion API not configured',
                message: 'Please set NOTION_API_KEY and NOTION_DATABASE_ID in .env'
            }
        };
    }

    if (!pageId) {
        return {
            status: 400,
            body: {
                error: 'Missing page id'
            }
        };
    }

    try {
        const page = await notion.pages.retrieve({ page_id: pageId });
        const title = page.properties?.Name?.title
            ?.map(textItem => textItem.plain_text)
            .join('')
            .trim() || 'Untitled';

        const blocks = [];
        let cursor;
        do {
            const response = await notion.blocks.children.list({
                block_id: pageId,
                start_cursor: cursor
            });
            blocks.push(...response.results);
            cursor = response.has_more ? response.next_cursor : null;
        } while (cursor);

        const serializedBlocks = blocks
            .map(block => {
                const payload = block[block.type];
                const rich = payload?.rich_text || [];
                const text = rich.map(t => t.plain_text).join('').trim();
                if (!text) return null;
                return {
                    id: block.id,
                    type: block.type,
                    text
                };
            })
            .filter(Boolean);

        return {
            status: 200,
            body: {
                id: pageId,
                title,
                blocks: serializedBlocks
            }
        };
    } catch (error) {
        console.error('Error fetching Notion page content:', error);
        return {
            status: 500,
            body: {
                error: 'Failed to fetch page content from Notion',
                message: error.message
            }
        };
    }
}

const server = Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        const { pathname } = url;

        // Basic rate limit by IP
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.remoteAddr || 'unknown';
        const now = Date.now();
        const entry = hits.get(ip) || { count: 0, reset: now + RATE_LIMIT.windowMs };
        if (now > entry.reset) {
            entry.count = 0;
            entry.reset = now + RATE_LIMIT.windowMs;
        }
        entry.count += 1;
        hits.set(ip, entry);
        if (entry.count > RATE_LIMIT.max) {
            return new Response('Too Many Requests', { status: 429 });
        }

        if (pathname === '/api/notion/places') {
            const { status, body } = await getNotionPlaces();
            return new Response(JSON.stringify(body), {
                status,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            });
        }

        if (pathname === '/api/notion/page') {
            const pageId = url.searchParams.get('id');
            const { status, body } = await getNotionPageContent(pageId);
            return new Response(JSON.stringify(body), {
                status,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            });
        }

        if (pathname === '/health') {
            return new Response(JSON.stringify({
                status: 'ok',
                notionApiKeyConfigured: !!NOTION_API_KEY,
                notionDatabaseConfigured: !!NOTION_DATABASE_ID
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store'
                }
            });
        }

        if (pathname === '/favicon.ico') {
            const iconFile = Bun.file(path.join(PUBLIC_DIR, 'icons', 'favicon.png'));
            if (await iconFile.exists()) {
                return new Response(iconFile, {
                    headers: {
                        'Content-Type': 'image/png',
                        'Cache-Control': 'public, max-age=86400'
                    }
                });
            }
            return new Response('Not Found', { status: 404 });
        }

        // Try static file
        const staticResponse = await serveStatic(pathname === '/' ? '/index.html' : pathname);
        if (staticResponse) return staticResponse;

        return new Response('Not Found', { status: 404 });
    }
});

console.log(`Bun server running on http://localhost:${server.port}`);
