import { Map as LeafletMap, TileLayer, Marker } from 'leaflet';
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

let map;

function normalizeIconKey(rawKey) {
    if (!rawKey) return 'Quest';
    const cleaned = rawKey.toString().trim();
    return icons[cleaned] ? cleaned : 'Quest';
}

function isNotionUrl(url) {
    return /^https?:\/\/[^\\s]+notion\\.so/i.test(url) || /^https?:\/\/[^\\s]+\\.notion\\.site/i.test(url);
}

function addMarker(location) {
    const iconKey = normalizeIconKey(location.icon);
    const marker = new Marker([location.lat, location.lng], {
        icon: icons[iconKey]
    }).addTo(map);

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
                <div class="popup-title">
                    ${location.name}
                    ${hasSourceLink ? `
                        <a class="popup-source-link" href="${location.sourceUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open source link">
                            <img class="popup-source-icon" src="/icons/Map_Link.png" alt="" />
                        </a>
                    ` : ''}
                </div>
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

function highlightLocation(locations) {
    const { lat, lng } = getHighlightParams();
    if (!(lat && lng)) return;
    if (!map) return;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 15));
}

// Load and display locations
async function loadLocations() {
    const locations = [];

    try {
        console.log('Fetching places from Notion...');
        const notionPlaces = await fetchNotionPlaces();
        console.log(`Found ${notionPlaces.length} places from Notion`);
        locations.push(...notionPlaces);
    } catch (error) {
        console.error('Failed to fetch Notion places:', error);
        alert('Failed to load places from Notion. Check console for details.');
    }

    // Add custom places from CONFIG
    if (CONFIG.customPlaces && CONFIG.customPlaces.length > 0) {
        locations.push(...CONFIG.customPlaces.map(place => ({
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            icon: place.icon || 'Quest', // Default icon
            description: place.description || ''
        })));
        console.log(`Added ${CONFIG.customPlaces.length} custom places`);
    }

    // Display all markers
    locations.forEach(addMarker);
    highlightLocation(locations);
    console.log(`Displayed ${locations.length} locations on map`);
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

    loadLocations().catch(console.error);
}

// Wait for full load to guarantee #map exists
if (document.readyState === 'complete') {
    initMap();
} else {
    window.addEventListener('load', initMap, { once: true });
}
