import { Client } from '@notionhq/client';

const notion = process.env.NOTION_API_KEY
    ? new Client({ auth: process.env.NOTION_API_KEY })
    : null;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
    if (!notion || !NOTION_DATABASE_ID) {
        return res.status(500).json({
            error: 'Notion API not configured',
            message: 'Please set NOTION_API_KEY and NOTION_DATABASE_ID in project env vars'
        });
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
                address
            };
        }).filter(place => place.lat !== null && place.lng !== null);

        return res.status(200).json({ places, count: places.length });
    } catch (error) {
        console.error('Error fetching Notion places:', error);
        return res.status(500).json({
            error: 'Failed to fetch places from Notion',
            message: error.message
        });
    }
}
