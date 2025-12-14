# World Map

Leaflet map that pulls locations from a Notion database (or manual entries) and displays them with RuneScape icons.

## Features
- Locations pulled from Notion database with `Category`, `Address`, `Latitude`, and `Longitude` properties
- Optional manual `customPlaces` list for quick overrides
- Lightweight Bun server for local use, plus Vercel-ready API routes
- Simple HTML/ESM frontend (Leaflet 2.0 alpha)

## Quick Setup
1) Install dependencies: `bun install`
2) Copy env: `cp .env.example .env`
3) Add Notion credentials to `.env`:
```
NOTION_API_KEY=secret_your_integration_token
NOTION_DATABASE_ID=your_database_id
PORT=3000
```
4) Populate your Notion database (schema below) and share it with the integration
5) Start the server: `bun start` then open http://localhost:3000

## Notion Database Schema
Create a table database with these properties:
| Property | Type | Notes |
| --- | --- | --- |
| Name | Title | Place name |
| Category | Select | Icon key (must match an icon in `icons.js`, e.g., `Restaurant`, `Bank`) |
| Address | Rich text | Shown in the popup |
| Latitude | Number | Required |
| Longitude | Number | Required |

Use the icon keys exactly as defined in `icons.js`. Unknown keys fall back to `Quest`.

## Config (`app.js`)
```js
const CONFIG = {
  mapCenter: [-33.8688, 151.2093],
  mapZoom: 11,
  useNotion: true,
  customPlaces: [
    // { name: "Central Station", lat: -33.88, lng: 151.21, icon: "Transport" }
  ]
};
```

## Files
- `server.js` — Bun server; fetches Notion records and maps categories to icons
- `api/notion/places.js` — Vercel serverless endpoint for Notion (for Vercel deploys)
- `api/health.js` — Vercel health endpoint
- `placesService.js` — Frontend API client for Notion
- `app.js` — Map init + marker rendering
- `icons.js` — Icon definitions

## Deploying to Vercel
1. Push this repo and connect it in Vercel.
2. Add environment variables in the Vercel dashboard:
   - `NOTION_API_KEY`
   - `NOTION_DATABASE_ID`
3. Deploy. The frontend stays static, and `/api/notion/places` & `/api/health` run via serverless functions.

## Troubleshooting
- Popups empty or markers missing? Check that Latitude/Longitude are numbers and the database is shared with your integration.
- Still seeing defaults for icons? Ensure your Notion `Category` exactly matches the icon name in `icons.js`, or tweak the mapping in `server.js`.
- Use the browser console for fetch errors; the backend also logs Notion query issues.
