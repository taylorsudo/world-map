import { Map as LeafletMap, TileLayer, Marker } from 'leaflet';
import { icons } from './icons.js';
import { fetchNotionPlaces } from './placesService.js';

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

function addMarker(location) {
    const iconKey = location.icon && icons[location.icon] ? location.icon : 'Quest';
    const marker = new Marker([location.lat, location.lng], {
        icon: icons[iconKey]
    }).addTo(map);

    marker.bindPopup(`
        <strong>${location.name}</strong><br>
        ${location.description || ''}
        ${location.category ? `<br><em>${location.category}</em>` : ''}
    `);

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
