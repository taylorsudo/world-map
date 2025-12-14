export default function handler(req, res) {
    return res.status(200).json({
        status: 'ok',
        notionApiKeyConfigured: !!process.env.NOTION_API_KEY,
        notionDatabaseConfigured: !!process.env.NOTION_DATABASE_ID
    });
}
