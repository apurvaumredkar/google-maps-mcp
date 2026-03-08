# google-maps-mcp

A TypeScript [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes Google Maps Platform APIs as tools for LLMs. Gives AI assistants real, structured map data — directions, transit routes, place search, address validation, photos, elevation, and more — instead of guessing from training data.

Works with Claude Desktop and any other MCP-compatible client.

---

## Features

**15 tools across three categories:**

| Category | Tools |
|----------|-------|
| **Maps** | Static map image URL, embed URL (iframe), elevation data, Street View image URL |
| **Routes** | Turn-by-turn directions (drive/walk/cycle/transit), distance matrix, multi-stop route optimization |
| **Places** | Geocoding / reverse geocoding, place details, text search, nearby search, autocomplete, photos, address validation, timezone |

**Transport**: HTTP Streamable (stateful sessions, SSE keep-alive) — the modern MCP transport, compatible with `mcp-remote` and all HTTP-capable clients.

**Minimal footprint**: only two runtime dependencies (`@modelcontextprotocol/sdk`, `zod`). All Google Maps calls use Node.js built-in `fetch` against REST APIs — no Google SDK required.

---

## Prerequisites

- **Node.js 22+** (or Docker)
- A **Google Maps Platform API key** with the relevant APIs enabled (see below)
- A Google Cloud project with billing enabled

### APIs to enable in Google Cloud Console

Go to [APIs & Services → Library](https://console.cloud.google.com/apis/library) and enable:

| API | Used by |
|-----|---------|
| Maps Static API | `maps_static_map` |
| Street View Static API | `maps_street_view` |
| Maps Embed API | `maps_embed_url` |
| Elevation API | `maps_elevation` |
| Geocoding API | `places_geocode` |
| Time Zone API | `places_timezone` |
| Places API (New) | `places_details`, `places_text_search`, `places_nearby_search`, `places_autocomplete`, `places_photos` |
| Address Validation API | `places_address_validation` |
| Routes API | `routes_compute`, `routes_matrix` |
| Route Optimization API | `routes_optimize` *(optional)* |

You can restrict the key to these APIs and to your server's IP for production use.

---

## Quick Start

### Option A — Run with Docker (recommended)

```bash
docker run -d \
  --name google-maps-mcp \
  -p 127.0.0.1:3003:3003 \
  -e GOOGLE_MAPS_API_KEY=your_key_here \
  -e MCP_AUTH_TOKEN=your_secret_token \
  ghcr.io/apurvaumredkar/google-maps-mcp:latest
```

Verify:
```bash
curl http://localhost:3003/health
# {"status":"ok","service":"google-maps-mcp"}
```

### Option B — npm / npx

No install required — run directly with `npx`:

```bash
GOOGLE_MAPS_API_KEY=your_key_here \
MCP_AUTH_TOKEN=your_secret_token \
npx mcp-server-google-maps
# google-maps-mcp listening on port 3003
```

Or install globally:

```bash
npm install -g mcp-server-google-maps
GOOGLE_MAPS_API_KEY=your_key_here MCP_AUTH_TOKEN=your_secret_token mcp-server-google-maps
```

Set `PORT=` to change the default port (`3003`).

---

### Option C — Build from source

```bash
git clone https://github.com/apurvaumredkar/google-maps-mcp.git
cd google-maps-mcp
npm install
npm run build
```

Create a `.env` file (or export the vars):
```
GOOGLE_MAPS_API_KEY=your_key_here
MCP_AUTH_TOKEN=your_secret_token
# Optional — only needed for routes_optimize:
GOOGLE_CLOUD_PROJECT_ID=your_project_id
```

Start the server:
```bash
GOOGLE_MAPS_API_KEY=... MCP_AUTH_TOKEN=... npm start
# google-maps-mcp listening on port 3003
```

### Option D — Docker Compose (self-hosted stack)

Add to your `docker-compose.yml`:

```yaml
services:
  google-maps-mcp:
    build: .
    container_name: google-maps-mcp
    restart: unless-stopped
    ports:
      - "127.0.0.1:3003:3003"
    environment:
      - GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY}
      - MCP_AUTH_TOKEN=${MCP_AUTH_TOKEN}
      - GOOGLE_CLOUD_PROJECT_ID=${GOOGLE_CLOUD_PROJECT_ID:-}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_MAPS_API_KEY` | Yes | Your Google Maps Platform API key |
| `MCP_AUTH_TOKEN` | Yes | Secret token clients must send in the `X-Api-Key` header. Generate one with `openssl rand -hex 32` |
| `PORT` | No | HTTP port (default: `3003`) |
| `GOOGLE_CLOUD_PROJECT_ID` | No | Required only for `routes_optimize` (Route Optimization API) |

---

## Connecting a Client

The server exposes a single endpoint: `POST/GET http://localhost:3003/mcp`

All requests must include the header:
```
X-Api-Key: <MCP_AUTH_TOKEN>
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "google-maps": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3003/mcp",
        "--header",
        "X-Api-Key: your_secret_token"
      ]
    }
  }
}
```

> **Windows + WSL**: if the server runs inside WSL, use the full node path:
> ```json
> {
>   "mcpServers": {
>     "google-maps": {
>       "command": "wsl",
>       "args": [
>         "--",
>         "/home/user/.nvm/versions/node/v25.2.1/bin/node",
>         "/home/user/.nvm/versions/node/v25.2.1/bin/mcp-remote",
>         "http://localhost:3003/mcp",
>         "--header",
>         "X-Api-Key: your_secret_token"
>       ]
>     }
>   }
> }
> ```

---

## Tool Reference

### Maps

#### `maps_static_map` — Static Map Image
Returns a direct image URL for a static map.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `center` | string | required | Address or `lat,lng` |
| `zoom` | integer | `13` | Zoom level 0–21 |
| `size` | string | `640x480` | Image dimensions WxH in pixels |
| `maptype` | enum | `roadmap` | `roadmap` \| `satellite` \| `terrain` \| `hybrid` |
| `markers` | string | — | Marker spec e.g. `color:red\|48.8566,2.3522` |
| `path` | string | — | Path spec for drawing routes |
| `format` | enum | `png` | `png` \| `jpg` \| `gif` |
| `scale` | enum | `1` | `1` = standard, `2` = HiDPI/retina |
| `language` | string | — | BCP 47 language code for labels |
| `region` | string | — | ISO 3166-1 alpha-2 region code |

---

#### `maps_embed_url` — Maps Embed URL
Returns an iframe-ready embed URL.

| Parameter | Type | Description |
|-----------|------|-------------|
| `mode` | enum | `place` \| `directions` \| `search` \| `view` \| `streetview` |
| `q` | string | Place/search query (place, search modes) |
| `center` | string | `lat,lng` for view/streetview mode |
| `zoom` | integer | Zoom level |
| `origin` / `destination` | string | For directions mode |
| `waypoints` | string | Pipe-separated waypoints |
| `maptype` | enum | `roadmap` \| `satellite` |

---

#### `maps_elevation` — Elevation Data
Returns elevation in metres above sea level.

| Parameter | Type | Description |
|-----------|------|-------------|
| `locations` | string | Pipe-separated `lat,lng` pairs |
| `path` | string | Pipe-separated `lat,lng` path |
| `samples` | integer | Number of samples along path (2–512) |

---

#### `maps_street_view` — Street View Image
Returns a direct Street View panorama image URL.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `location` | string | — | Address or `lat,lng` |
| `pano` | string | — | Specific panorama ID (overrides location) |
| `size` | string | `640x480` | Image size WxH |
| `heading` | number | — | Camera heading 0–360° |
| `pitch` | number | — | Camera pitch -90° to 90° |
| `fov` | number | `90` | Field of view 10–120° |
| `source` | enum | — | `outdoor` to exclude indoor panoramas |

---

### Routes

#### `routes_compute` — Compute Route
Turn-by-turn directions with real-time traffic.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `origin` | string | required | Address or `lat,lng` |
| `destination` | string | required | Address or `lat,lng` |
| `travel_mode` | enum | `DRIVE` | `DRIVE` \| `WALK` \| `BICYCLE` \| `TRANSIT` \| `TWO_WHEELER` |
| `intermediates` | string[] | — | Waypoints between origin and destination |
| `departure_time` | string | — | ISO 8601 datetime for traffic-aware routing |
| `avoid_tolls` | boolean | `false` | Avoid toll roads |
| `avoid_highways` | boolean | `false` | Avoid highways |
| `avoid_ferries` | boolean | `false` | Avoid ferries |
| `units` | enum | `METRIC` | `METRIC` \| `IMPERIAL` |
| `compute_alternative_routes` | boolean | `false` | Return up to 3 alternatives |

---

#### `routes_matrix` — Route Distance Matrix
Compute travel time/distance between multiple origins and destinations simultaneously.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `origins` | string[] | required | Up to 25 addresses or `lat,lng` strings |
| `destinations` | string[] | required | Up to 25 addresses or `lat,lng` strings |
| `travel_mode` | enum | `DRIVE` | `DRIVE` \| `WALK` \| `BICYCLE` \| `TRANSIT` |
| `departure_time` | string | — | ISO 8601 datetime |
| `units` | enum | `METRIC` | `METRIC` \| `IMPERIAL` |

---

#### `routes_optimize` — Optimize Multi-Stop Route
Optimizes stop order to minimize total travel. Requires `GOOGLE_CLOUD_PROJECT_ID`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `vehicle_start` | string | Start location — **must be `lat,lng`** (geocode first if needed) |
| `vehicle_end` | string | End location (defaults to start) |
| `visits` | object[] | Array of `{ address, label?, duration_minutes? }` — addresses must be `lat,lng` |
| `travel_mode` | enum | `DRIVING` \| `WALKING` |

---

### Places

#### `places_geocode` — Geocode / Reverse Geocode
Convert addresses ↔ coordinates.

| Parameter | Type | Description |
|-----------|------|-------------|
| `address` | string | Address to geocode |
| `latlng` | string | `lat,lng` for reverse geocoding |
| `region` | string | ISO 3166-1 alpha-2 region bias |
| `components` | string | Component filter e.g. `country:FR\|postal_code:75001` |

---

#### `places_details` — Place Details
Full details for a place by its Google Place ID.

| Parameter | Type | Description |
|-----------|------|-------------|
| `place_id` | string | Google Place ID |
| `fields` | string | Comma-separated field mask (has sensible default) |
| `language_code` | string | Response language |

---

#### `places_text_search` — Search Places by Text
Find places matching a natural language query.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | e.g. `"best ramen in Tokyo"` |
| `location_bias_lat/lng` | number | Bias results toward this location |
| `location_bias_radius_m` | number | Bias circle radius |
| `max_results` | integer | 1–20, default 10 |
| `min_rating` | number | Minimum average star rating (0–5) |
| `open_now` | boolean | Only currently open places |
| `included_type` | string | Filter by place type e.g. `restaurant` |
| `price_levels` | enum[] | `PRICE_LEVEL_FREE` … `PRICE_LEVEL_VERY_EXPENSIVE` |

---

#### `places_nearby_search` — Search Nearby Places
Find places near a coordinate within a radius.

| Parameter | Type | Description |
|-----------|------|-------------|
| `latitude` / `longitude` | number | Center of search |
| `radius_m` | number | Search radius in metres (max 50,000) |
| `included_types` | string[] | Place type filters |
| `excluded_types` | string[] | Place types to exclude |
| `max_results` | integer | 1–20, default 10 |
| `rank_preference` | enum | `DISTANCE` \| `POPULARITY` |

---

#### `places_autocomplete` — Place Autocomplete
Predict place names from partial input.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | string | Partial text to complete |
| `location_bias_lat/lng` | number | Bias toward this location |
| `included_primary_types` | string[] | Type filter |
| `country_codes` | string[] | ISO 3166-1 alpha-2 country filter |
| `include_query_predictions` | boolean | Also return query predictions |

---

#### `places_photos` — Place Photos
Get photo URLs for a place.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `place_id` | string | required | Google Place ID |
| `max_photos` | integer | `3` | Max photos to return (1–10) |
| `max_width_px` | integer | `1200` | Max photo width in pixels |
| `max_height_px` | integer | `900` | Max photo height in pixels |

---

#### `places_address_validation` — Validate Address
Validate and standardize a postal address.

| Parameter | Type | Description |
|-----------|------|-------------|
| `address_lines` | string[] | Address lines |
| `region_code` | string | ISO 3166-1 alpha-2 country code |
| `locality` | string | City/town |
| `administrative_area` | string | State/province |
| `postal_code` | string | Postal code |
| `enable_usps_cass` | boolean | USPS CASS validation (US only) |

---

#### `places_timezone` — Get Timezone
Get IANA timezone and UTC/DST offset for any coordinates.

| Parameter | Type | Description |
|-----------|------|-------------|
| `latitude` / `longitude` | number | Location |
| `timestamp` | integer | Unix timestamp for DST calculation (defaults to now) |
| `language` | string | Response language |

---

## Architecture

```
src/
├── index.ts         # Raw Node.js HTTP server, auth, stateful session management
├── server.ts        # McpServer instantiation + tool registration
├── maps-client.ts   # Typed fetch wrappers for all Google Maps REST APIs
└── tools/
    ├── maps.ts      # 4 tools: static map, embed, elevation, street view
    ├── routes.ts    # 3 tools: compute route, matrix, optimize
    └── places.ts    # 8 tools: geocode, details, text search, nearby, autocomplete,
                     #          photos, address validation, timezone
```

**Key design decisions:**

- **Raw `node:http`** instead of Express — required for correct interop with the MCP SDK's internal Hono-based request handling. Express pre-consumes the request body stream in a way that breaks `StreamableHTTPServerTransport`.
- **Stateful session map** — `mcp-remote` and SSE keep-alive require sessions to persist across requests. Sessions are keyed by `Mcp-Session-Id` header and cleaned up on transport close.
- **Auth before body read** — the `X-Api-Key` check happens on the header before any body stream is touched, so rejected requests drain cleanly.
- **Auth split for Google APIs** — legacy REST APIs (Static Maps, Geocoding, Elevation, Timezone, Street View) use `?key=` query param; new APIs (Places v1, Routes v2, Address Validation) use `X-Goog-Api-Key` header.

---

## Development

```bash
npm run dev    # TypeScript watch mode (tsc --watch)
npm run build  # Compile to dist/
npm start      # Run compiled server
```

### Rebuild Docker image after changes

```bash
docker compose build google-maps-mcp
docker compose up -d google-maps-mcp
```

### Testing the MCP endpoint

```bash
# Health check (no auth required)
curl http://localhost:3003/health

# MCP initialize (auth required)
TOKEN=your_secret_token
curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Api-Key: $TOKEN" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}},"id":1}'

# List tools (use session ID from Mcp-Session-Id response header)
SESSION=<Mcp-Session-Id from above>
curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Api-Key: $TOKEN" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
```

> **Windows/WSL gotcha**: if your `.env` file has Windows CRLF line endings, extract values with `tr -d '\r'`:
> ```bash
> TOKEN=$(grep MCP_AUTH_TOKEN .env | cut -d= -f2 | tr -d '\r')
> ```

---
