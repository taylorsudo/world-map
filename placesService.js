const NOTION_API_BASE_URL = '/api/notion';

/**
 * Fetches places from Notion database via Node.js backend
 * @returns {Promise<Array>} Array of locations
 */
export async function fetchNotionPlaces() {
    try {
        const response = await fetch(`${NOTION_API_BASE_URL}/places`);

        if (!response.ok) {
            // Clone so we can attempt both json() and text() without disturbing the body
            const clone = response.clone();
            let message = `Request failed (${response.status})`;
            try {
                const errorJson = await clone.json();
                message = errorJson.message || errorJson.error || message;
            } catch {
                const text = await response.text();
                if (text) {
                    message = `${message}: ${text.slice(0, 200)}`;
                }
            }
            throw new Error(message);
        }

        const data = await response.json();

        return data.places.map(place => ({
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            icon: place.icon || 'Quest',
            description: place.description || place.address || '',
            category: place.category || '',
            address: place.address || ''
        }));
    } catch (error) {
        console.error('Error fetching Notion places:', error);
        throw error;
    }
}
