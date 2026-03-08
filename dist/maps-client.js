/**
 * Typed fetch wrappers for all Google Maps Platform REST APIs.
 *
 * Auth split:
 *   Legacy APIs (Static Maps, Street View, Geocoding, Elevation, Timezone)
 *     → ?key= query param
 *   New APIs (Places v1, Routes, Address Validation)
 *     → X-Goog-Api-Key header
 */
const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';
if (!MAPS_API_KEY) {
    console.warn('WARNING: GOOGLE_MAPS_API_KEY is not set. All API calls will fail.');
}
// ── Helpers ──────────────────────────────────────────────────────────────────
async function mapsGet(baseUrl, params) {
    const qs = new URLSearchParams({ ...params, key: MAPS_API_KEY });
    const res = await fetch(`${baseUrl}?${qs}`);
    const body = await res.text();
    if (!res.ok)
        throw new Error(`Maps API ${res.status}: ${body}`);
    return JSON.parse(body);
}
async function mapsPost(url, body, extraHeaders = {}) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': MAPS_API_KEY,
            ...extraHeaders,
        },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok)
        throw new Error(`Maps API ${res.status}: ${text}`);
    return JSON.parse(text);
}
async function mapsGetNew(baseUrl, params, extraHeaders = {}) {
    const qs = new URLSearchParams(params);
    const res = await fetch(`${baseUrl}?${qs}`, {
        headers: {
            'X-Goog-Api-Key': MAPS_API_KEY,
            ...extraHeaders,
        },
    });
    const text = await res.text();
    if (!res.ok)
        throw new Error(`Maps API ${res.status}: ${text}`);
    return JSON.parse(text);
}
// ── URL builders (no network call) ───────────────────────────────────────────
export function buildStaticMapUrl(params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined)
            qs.set(k, v);
    }
    qs.set('key', MAPS_API_KEY);
    return `https://maps.googleapis.com/maps/api/staticmap?${qs}`;
}
export function buildStreetViewUrl(params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined)
            qs.set(k, v);
    }
    qs.set('key', MAPS_API_KEY);
    return `https://maps.googleapis.com/maps/api/streetview?${qs}`;
}
export function buildEmbedUrl(mode, params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined)
            qs.set(k, v);
    }
    qs.set('key', MAPS_API_KEY);
    return `https://www.google.com/maps/embed/v1/${mode}?${qs}`;
}
// ── Maps APIs ─────────────────────────────────────────────────────────────────
export async function getElevation(params) {
    return mapsGet('https://maps.googleapis.com/maps/api/elevation/json', params);
}
// ── Geocoding / Timezone ──────────────────────────────────────────────────────
export async function geocode(params) {
    return mapsGet('https://maps.googleapis.com/maps/api/geocode/json', params);
}
export async function getTimezone(params) {
    return mapsGet('https://maps.googleapis.com/maps/api/timezone/json', params);
}
// ── Places API v1 (New) ───────────────────────────────────────────────────────
export async function getPlaceDetails(placeId, fieldMask, languageCode) {
    return mapsGetNew(`https://places.googleapis.com/v1/places/${placeId}`, { languageCode }, { 'X-Goog-FieldMask': fieldMask });
}
export async function textSearch(body, fieldMask) {
    return mapsPost('https://places.googleapis.com/v1/places:searchText', body, { 'X-Goog-FieldMask': fieldMask });
}
export async function nearbySearch(body, fieldMask) {
    return mapsPost('https://places.googleapis.com/v1/places:searchNearby', body, { 'X-Goog-FieldMask': fieldMask });
}
export async function autocomplete(body) {
    return mapsPost('https://places.googleapis.com/v1/places:autocomplete', body);
}
export async function getPlacePhotos(placeId, maxPhotos, maxWidthPx, maxHeightPx) {
    // 1. Fetch place details to get photo resource names
    const details = (await getPlaceDetails(placeId, 'photos', 'en'));
    const photos = details.photos?.slice(0, maxPhotos) ?? [];
    // 2. Fetch each photo media URL (skipHttpRedirect=true → returns JSON with photoUri)
    const results = await Promise.all(photos.map(async (photo) => {
        const qs = new URLSearchParams({
            maxWidthPx: String(maxWidthPx),
            maxHeightPx: String(maxHeightPx),
            skipHttpRedirect: 'true',
            key: MAPS_API_KEY,
        });
        const res = await fetch(`https://places.googleapis.com/v1/${photo.name}/media?${qs}`, { headers: { 'X-Goog-Api-Key': MAPS_API_KEY } });
        const text = await res.text();
        if (!res.ok)
            return null;
        const data = JSON.parse(text);
        return {
            uri: data.photoUri ?? '',
            attribution: photo.authorAttributions?.[0]?.displayName ?? '',
        };
    }));
    return { photos: results.filter(Boolean) };
}
// ── Address Validation ────────────────────────────────────────────────────────
export async function validateAddress(body) {
    return mapsPost('https://addressvalidation.googleapis.com/v1:validateAddress', body);
}
// ── Routes API v2 ─────────────────────────────────────────────────────────────
export async function computeRoutes(body, fieldMask) {
    return mapsPost('https://routes.googleapis.com/directions/v2:computeRoutes', body, { 'X-Goog-FieldMask': fieldMask });
}
export async function computeRouteMatrix(body, fieldMask) {
    return mapsPost('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', body, { 'X-Goog-FieldMask': fieldMask });
}
// ── Route Optimization ────────────────────────────────────────────────────────
export async function optimizeTours(projectId, body) {
    return mapsPost(`https://routeoptimization.googleapis.com/v1/projects/${projectId}:optimizeTours`, body);
}
// ── Helpers for Routes API waypoint format ────────────────────────────────────
export function parseWaypoint(input) {
    // If input looks like "lat,lng" use latLng, otherwise use address
    const latLngMatch = input.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (latLngMatch) {
        return {
            location: {
                latLng: {
                    latitude: parseFloat(latLngMatch[1]),
                    longitude: parseFloat(latLngMatch[2]),
                },
            },
        };
    }
    return { address: input };
}
