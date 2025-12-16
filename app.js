import { Map as LeafletMap, TileLayer, Marker, LayerGroup } from 'leaflet';
import { icons } from './icons.js';
import { fetchNotionPlaces, fetchNotionPageContent } from './placesService.js';

// Configuration
const CONFIG = {
    // Map settings
    mapCenter: [-33.8688, 151.2093], // Change to your area
    mapZoom: 11,

    // Add specific places manually here
    // To add places: grab the name and coordinates from any map app
    customPlaces: [
        // { name: "Central Station", lat: -33.88, lng: 151.21, icon: "Transport" }
    ]
};

const VIEWPORT_PADDING = 0.2; // expand bounds to prefetch slightly outside the screen
const FETCH_DEBOUNCE_MS = 200;

let map;
let notionLayer;
let customLayer;
let hasHighlighted = false;
let pendingFetchTimeout = null;
let fetchSeq = 0;

function normalizeIconKey(rawKey) {
    if (!rawKey) return 'Quest';
    const cleaned = rawKey.toString().trim();
    return icons[cleaned] ? cleaned : 'Quest';
}

function isNotionUrl(url) {
    return /^https?:\/\/[^\\s]+notion\\.so/i.test(url) || /^https?:\/\/[^\\s]+\\.notion\\.site/i.test(url);
}

function addMarker(location, targetLayer = map) {
    const iconKey = normalizeIconKey(location.icon);
    const marker = new Marker([location.lat, location.lng], {
        icon: icons[iconKey]
    }).addTo(targetLayer);

    // Create initial popup content
    const initialContent = `
        <div class="popup-title">${location.name}</div>
        <div class="popup-content">Loading details...</div>
    `;

    marker.bindPopup(initialContent);

    // When popup opens, fetch and display Notion content
    marker.on('popupopen', async () => {
        if (!location.id) {
            marker.setPopupContent(`
                <div class="popup-title">${location.name}</div>
                <div class="popup-content">No linked Notion page</div>
            `);
            return;
        }

        try {
            const data = await fetchNotionPageContent(location.id);
            const hasSourceLink = location.sourceUrl && !isNotionUrl(location.sourceUrl);

            let content = `
                <div class="popup-title">${location.name}${hasSourceLink ? `<a class="popup-source-link" href="${location.sourceUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open source link"><img class="popup-source-icon" src="/icons/Map_Link.png" alt=""></a>` : ''}</div>
            `;

            const addressText = location.address || location.description || '';
            if (addressText) {
                content += `<div class="popup-address">${addressText}</div>`;
            }

            if (data.blocks && data.blocks.length > 0) {
                const notionText = data.blocks.map(block => {
                    if (block.type?.startsWith('heading')) {
                        return `<strong>${block.text}</strong>`;
                    }
                    return block.text;
                }).join('<br>');
                content += `<div class="popup-content">${notionText}</div>`;
            } else {
                content += `<div class="popup-content">No content available</div>`;
            }

            marker.setPopupContent(content);
        } catch (error) {
            console.error('Failed to fetch Notion page content:', error);
            marker.setPopupContent(`
                <div class="popup-title">${location.name}</div>
                <div class="popup-address">${location.address || location.description || ''}</div>
                <div class="popup-content">Failed to load details</div>
            `);
        }
    });

    return marker;
}

function getHighlightParams() {
    const params = new URLSearchParams(window.location.search);
    const lat = params.get('lat');
    const lng = params.get('lng');

    return {
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null
    };
}

function getMapBoundsObject() {
    if (!map) return null;
    const bounds = map.getBounds();
    return {
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast()
    };
}

function padBounds(bounds, paddingFactor = VIEWPORT_PADDING) {
    const latSpan = bounds.maxLat - bounds.minLat || 0.1;
    const lngSpan = bounds.maxLng - bounds.minLng || 0.1;
    const latPad = latSpan * paddingFactor;
    const lngPad = lngSpan * paddingFactor;
    return {
        minLat: bounds.minLat - latPad,
        maxLat: bounds.maxLat + latPad,
        minLng: bounds.minLng - lngPad,
        maxLng: bounds.maxLng + lngPad
    };
}

function mergeBoundsWithPoint(bounds, lat, lng) {
    if (lat === null || lng === null) return bounds;
    return {
        minLat: Math.min(bounds.minLat, lat),
        maxLat: Math.max(bounds.maxLat, lat),
        minLng: Math.min(bounds.minLng, lng),
        maxLng: Math.max(bounds.maxLng, lng)
    };
}

function maybeHighlight() {
    if (hasHighlighted) return;
    const { lat, lng } = getHighlightParams();
    if (!(lat && lng)) return;
    if (!map) return;
    hasHighlighted = true;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 15));
}

function renderCustomPlaces() {
    if (!CONFIG.customPlaces || CONFIG.customPlaces.length === 0 || !customLayer) return;
    customLayer.clearLayers();
    CONFIG.customPlaces.forEach(place => {
        addMarker({
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            icon: place.icon || 'Quest',
            description: place.description || '',
            address: place.address || '',
            sourceUrl: place.sourceUrl || ''
        }, customLayer);
    });
    console.log(`Added ${CONFIG.customPlaces.length} custom places`);
}

async function loadViewportLocations() {
    if (!map) return;
    const mapBounds = getMapBoundsObject();
    if (!mapBounds) return;
    let queryBounds = padBounds(mapBounds);

    const { lat: highlightLat, lng: highlightLng } = getHighlightParams();
    if (highlightLat && highlightLng) {
        queryBounds = mergeBoundsWithPoint(queryBounds, highlightLat, highlightLng);
    }

    const localFetchId = ++fetchSeq;

    try {
        const locations = await fetchNotionPlaces({ bounds: queryBounds });
        if (localFetchId !== fetchSeq) return;

        if (notionLayer) {
            notionLayer.clearLayers();
            locations.forEach(loc => addMarker(loc, notionLayer));
        } else {
            locations.forEach(addMarker);
        }

        maybeHighlight();
        console.log(`Displayed ${locations.length} locations for viewport`, queryBounds);
    } catch (error) {
        console.error('Failed to load Notion places:', error);
        alert('Failed to load places from Notion. Check console for details.');
    }
}

function scheduleViewportLoad() {
    if (pendingFetchTimeout) {
        clearTimeout(pendingFetchTimeout);
    }
    pendingFetchTimeout = setTimeout(loadViewportLocations, FETCH_DEBOUNCE_MS);
}

// Initialize
let initAttempts = 0;
function initMap() {
    const container = document.getElementById('map');
    if (!container) {
        initAttempts += 1;
        if (initAttempts <= 5) {
            // Retry shortly in case DOM/content is still streaming in
            setTimeout(initMap, 100);
        } else {
            console.error('Map container #map not found after multiple attempts.');
        }
        return;
    }

    map = new LeafletMap(container).setView(CONFIG.mapCenter, CONFIG.mapZoom);

    new TileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    notionLayer = new LayerGroup().addTo(map);
    customLayer = new LayerGroup().addTo(map);
    renderCustomPlaces();

    map.on('moveend', scheduleViewportLoad);
    scheduleViewportLoad();
}

// Wait for full load to guarantee #map exists
if (document.readyState === 'complete') {
    initMap();
} else {
    window.addEventListener('load', initMap, { once: true });
}
