import { Client } from '@notionhq/client';

const notion = process.env.NOTION_API_KEY
    ? new Client({ auth: process.env.NOTION_API_KEY })
    : null;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPlaces = { expiresAt: 0, data: null, promise: null };

async function fetchAllDatabasePages(databaseId) {
    const pages = [];
    let cursor;
    do {
        const response = await notion.databases.query({
            database_id: databaseId,
            start_cursor: cursor,
            page_size: 100
        });
        pages.push(...response.results);
        cursor = response.has_more ? response.next_cursor : null;
    } while (cursor);
    return pages;
}

async function loadPlaces() {
    const now = Date.now();
    if (cachedPlaces.data && cachedPlaces.expiresAt > now) {
        return cachedPlaces.data;
    }
    if (cachedPlaces.promise) {
        return cachedPlaces.promise;
    }

    cachedPlaces.promise = (async () => {
        const pages = await fetchAllDatabasePages(NOTION_DATABASE_ID);

        const places = pages.map(page => {
            const props = page.properties;
            const name = props.Name?.title?.[0]?.plain_text || 'Unnamed Place';
            const lat = props.Latitude?.number ?? null;
            const lng = props.Longitude?.number ?? null;
            const category = (props.Category?.select?.name || '').trim();
            const address = (props.Address?.rich_text || [])
                .map(textItem => textItem.plain_text)
                .join('')
                .trim();
            const sourceUrl = (props['Source URL']?.url || '').trim();

            const icon = category || 'Quest';
            const description = address || category;

            return {
                id: page.id,
                name,
                lat,
                lng,
                icon,
                description,
                category,
                address,
                sourceUrl
            };
        }).filter(place => place.lat !== null && place.lng !== null);

        return places;
    })();

    try {
        const data = await cachedPlaces.promise;
        cachedPlaces = {
            data,
            expiresAt: now + CACHE_TTL_MS,
            promise: null
        };
        return data;
    } catch (error) {
        cachedPlaces.promise = null;
        throw error;
    }
}

function parseBounds(query) {
    const minLat = parseFloat(query.minLat);
    const maxLat = parseFloat(query.maxLat);
    const minLng = parseFloat(query.minLng);
    const maxLng = parseFloat(query.maxLng);
    const hasBounds = [minLat, maxLat, minLng, maxLng].every(val => Number.isFinite(val));
    if (!hasBounds) return null;
    return { minLat, maxLat, minLng, maxLng };
}

function filterByBounds(places, bounds) {
    if (!bounds) return places;
    const { minLat, maxLat, minLng, maxLng } = bounds;
    return places.filter(place => place.lat >= minLat && place.lat <= maxLat && place.lng >= minLng && place.lng <= maxLng);
}

export default async function handler(req, res) {
    if (!notion || !NOTION_DATABASE_ID) {
        return res.status(500).json({
            error: 'Notion API not configured',
            message: 'Please set NOTION_API_KEY and NOTION_DATABASE_ID in project env vars'
        });
    }

    try {
        const places = await loadPlaces();
        const bounds = parseBounds(req.query || {});
        const filtered = filterByBounds(places, bounds);

        return res.status(200).json({ places: filtered, count: filtered.length });
    } catch (error) {
        console.error('Error fetching Notion places:', error);
        return res.status(500).json({
            error: 'Failed to fetch places from Notion',
            message: error.message
        });
    }
}
