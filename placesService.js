const NOTION_API_BASE_URL = '/api/notion';
const CACHE_TTL_MS = 5 * 60 * 1000;
const boundsCache = new Map();

function normalizeBounds(bounds) {
    if (!bounds) return null;
    const { minLat, maxLat, minLng, maxLng } = bounds;
    const values = [minLat, maxLat, minLng, maxLng].map(Number);
    if (values.some(v => Number.isNaN(v))) return null;
    return { minLat: values[0], maxLat: values[1], minLng: values[2], maxLng: values[3] };
}

function boundsToCacheKey(bounds) {
    if (!bounds) return 'all';
    const round = (value) => Math.round(value * 100) / 100; // ~1km precision
    const normalized = [
        round(bounds.minLat),
        round(bounds.maxLat),
        round(bounds.minLng),
        round(bounds.maxLng)
    ];
    return normalized.join(':');
}

function readFromCache(cacheKey) {
    const entry = boundsCache.get(cacheKey);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        boundsCache.delete(cacheKey);
        return null;
    }
    return entry.data;
}

function writeToCache(cacheKey, data) {
    boundsCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS
    });
}

/**
 * Fetches places from Notion database via Node.js backend
 * @param {Object} [options]
 * @param {Object} [options.bounds] Bounding box to query { minLat, maxLat, minLng, maxLng }
 * @returns {Promise<Array>} Array of locations
 */
export async function fetchNotionPlaces(options = {}) {
    const bounds = normalizeBounds(options.bounds);
    const cacheKey = boundsToCacheKey(bounds);
    const cached = readFromCache(cacheKey);
    if (cached) return cached;

    try {
        const url = new URL(`${NOTION_API_BASE_URL}/places`, window.location.origin);
        if (bounds) {
            url.searchParams.set('minLat', bounds.minLat);
            url.searchParams.set('maxLat', bounds.maxLat);
            url.searchParams.set('minLng', bounds.minLng);
            url.searchParams.set('maxLng', bounds.maxLng);
        }

        const response = await fetch(url.toString());

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

        const mapped = data.places.map(place => ({
            id: place.id,
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            icon: place.icon || 'Quest',
            description: place.description || place.address || '',
            category: place.category || '',
            address: place.address || '',
            sourceUrl: place.sourceUrl || ''
        }));

        writeToCache(cacheKey, mapped);
        return mapped;
    } catch (error) {
        console.error('Error fetching Notion places:', error);
        throw error;
    }
}

export async function fetchNotionPageContent(pageId) {
    const response = await fetch(`${NOTION_API_BASE_URL}/page?id=${encodeURIComponent(pageId)}`);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to fetch page content: ${response.status} ${text}`);
    }
    return response.json();
}
