import { Client } from '@notionhq/client';

const notion = process.env.NOTION_API_KEY
    ? new Client({ auth: process.env.NOTION_API_KEY })
    : null;

async function fetchBlocks(pageId) {
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
    return blocks;
}

function serializeBlocks(blocks) {
    return blocks
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
}

export default async function handler(req, res) {
    if (!notion) {
        return res.status(500).json({
            error: 'Notion API not configured',
            message: 'Please set NOTION_API_KEY and NOTION_DATABASE_ID in project env vars'
        });
    }

    const pageId = req.query.id;
    if (!pageId) {
        return res.status(400).json({
            error: 'Missing page id'
        });
    }

    try {
        const page = await notion.pages.retrieve({ page_id: pageId });
        const title = page.properties?.Name?.title
            ?.map(textItem => textItem.plain_text)
            .join('')
            .trim() || 'Untitled';

        const blocks = await fetchBlocks(pageId);

        return res.status(200).json({
            id: pageId,
            title,
            blocks: serializeBlocks(blocks)
        });
    } catch (error) {
        console.error('Error fetching Notion page content:', error);
        return res.status(500).json({
            error: 'Failed to fetch page content from Notion',
            message: error.message
        });
    }
}
