export default async function handler(req, res) {
    return res.status(200).json({
        hasNotionKey: !!process.env.NOTION_API_KEY,
        hasDatabaseId: !!process.env.NOTION_DATABASE_ID,
        databaseIdLength: process.env.NOTION_DATABASE_ID?.length || 0,
        // Don't expose actual values for security
        keyPrefix: process.env.NOTION_API_KEY?.substring(0, 7) || 'missing'
    });
}
