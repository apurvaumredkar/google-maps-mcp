import { z } from 'zod';
import { computeRoutes, computeRouteMatrix, optimizeTours, parseWaypoint } from '../maps-client.js';
export function registerRoutesTools(server) {
    // ── Compute Routes ─────────────────────────────────────────────────────────
    server.registerTool('routes_compute', {
        title: 'Compute Route',
        description: 'Get turn-by-turn directions between an origin and destination, with real-time traffic data. Supports driving, walking, cycling, and transit. Returns distance, duration, and step-by-step legs.',
        inputSchema: {
            origin: z.string().describe("Origin — address or 'lat,lng'"),
            destination: z.string().describe("Destination — address or 'lat,lng'"),
            travel_mode: z.enum(['DRIVE', 'WALK', 'BICYCLE', 'TRANSIT', 'TWO_WHEELER'])
                .default('DRIVE')
                .describe('Mode of travel'),
            intermediates: z.array(z.string()).optional().describe("Intermediate waypoints — array of addresses or 'lat,lng' strings"),
            departure_time: z.string().optional().describe('ISO 8601 datetime for traffic-aware routing (e.g. 2025-06-15T09:00:00Z)'),
            avoid_tolls: z.boolean().default(false).optional(),
            avoid_highways: z.boolean().default(false).optional(),
            avoid_ferries: z.boolean().default(false).optional(),
            units: z.enum(['METRIC', 'IMPERIAL']).default('METRIC').optional(),
            language_code: z.string().default('en').optional(),
            compute_alternative_routes: z.boolean().default(false).optional().describe('Return up to 3 alternative routes'),
        },
    }, async ({ origin, destination, travel_mode, intermediates, departure_time, avoid_tolls, avoid_highways, avoid_ferries, units, language_code, compute_alternative_routes, }) => {
        try {
            const routeModifiers = {};
            if (avoid_tolls)
                routeModifiers.avoidTolls = true;
            if (avoid_highways)
                routeModifiers.avoidHighways = true;
            if (avoid_ferries)
                routeModifiers.avoidFerries = true;
            const body = {
                origin: parseWaypoint(origin),
                destination: parseWaypoint(destination),
                travelMode: travel_mode,
                computeAlternativeRoutes: compute_alternative_routes,
                units,
                languageCode: language_code,
            };
            if (intermediates && intermediates.length > 0) {
                body.intermediates = intermediates.map(parseWaypoint);
            }
            if (Object.keys(routeModifiers).length > 0) {
                body.routeModifiers = routeModifiers;
            }
            if (departure_time) {
                body.departureTime = departure_time;
            }
            const fieldMask = [
                'routes.duration',
                'routes.distanceMeters',
                'routes.description',
                'routes.legs',
                'routes.polyline.encodedPolyline',
                'routes.travelAdvisory',
            ].join(',');
            const data = await computeRoutes(body, fieldMask);
            return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: 'text', text: String(err) }] };
        }
    });
    // ── Route Matrix ───────────────────────────────────────────────────────────
    server.registerTool('routes_matrix', {
        title: 'Route Distance Matrix',
        description: 'Compute travel time and distance between multiple origins and destinations simultaneously. Great for comparing travel options or finding the closest point from many locations.',
        inputSchema: {
            origins: z.array(z.string()).min(1).max(25).describe("Array of origin addresses or 'lat,lng' strings"),
            destinations: z.array(z.string()).min(1).max(25).describe("Array of destination addresses or 'lat,lng' strings"),
            travel_mode: z.enum(['DRIVE', 'WALK', 'BICYCLE', 'TRANSIT']).default('DRIVE'),
            departure_time: z.string().optional().describe('ISO 8601 datetime for traffic-aware results'),
            units: z.enum(['METRIC', 'IMPERIAL']).default('METRIC').optional(),
            language_code: z.string().default('en').optional(),
        },
    }, async ({ origins, destinations, travel_mode, departure_time, units, language_code }) => {
        try {
            const body = {
                origins: origins.map((o) => ({ waypoint: parseWaypoint(o) })),
                destinations: destinations.map((d) => ({ waypoint: parseWaypoint(d) })),
                travelMode: travel_mode,
                units,
                languageCode: language_code,
            };
            if (departure_time)
                body.departureTime = departure_time;
            const fieldMask = 'originIndex,destinationIndex,duration,distanceMeters,status,condition';
            const data = await computeRouteMatrix(body, fieldMask);
            return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: 'text', text: String(err) }] };
        }
    });
    // ── Route Optimization ─────────────────────────────────────────────────────
    server.registerTool('routes_optimize', {
        title: 'Optimize Multi-Stop Route',
        description: 'Optimizes the order of stops for one or more vehicles to minimize total travel time/distance. Ideal for planning road trips with multiple destinations. Requires GOOGLE_CLOUD_PROJECT_ID to be configured.',
        inputSchema: {
            vehicle_start: z.string().describe("Vehicle start location — address or 'lat,lng'"),
            vehicle_end: z.string().optional().describe("Vehicle end location — defaults to start if not provided"),
            visits: z.array(z.object({
                address: z.string().describe("Stop address or 'lat,lng'"),
                label: z.string().optional().describe('Human-readable label for this stop'),
                duration_minutes: z.number().int().min(0).default(0).optional().describe('Time to spend at this stop in minutes'),
            })).min(1).max(25).describe('List of stops to visit'),
            travel_mode: z.enum(['DRIVING', 'WALKING']).default('DRIVING'),
        },
    }, async ({ vehicle_start, vehicle_end, visits, travel_mode }) => {
        try {
            const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
            if (!projectId) {
                throw new Error('Route Optimization requires GOOGLE_CLOUD_PROJECT_ID environment variable to be set. ' +
                    'Add it to your .env file and restart the container.');
            }
            const parseLocation = (addr) => {
                const m = addr.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
                if (m) {
                    return {
                        latitude: parseFloat(m[1]),
                        longitude: parseFloat(m[2]),
                    };
                }
                // For the optimization API, addresses need to be geocoded first.
                // We return a placeholder — the API accepts waypoints by address string in the `placeId` field,
                // but the simplest approach is to note this limitation.
                throw new Error(`Route Optimization API requires lat,lng coordinates. ` +
                    `Please geocode "${addr}" first using places_geocode.`);
            };
            const shipments = visits.map((v, i) => ({
                label: v.label ?? `Stop ${i + 1}`,
                deliveries: [
                    {
                        arrivalLocation: parseLocation(v.address),
                        duration: `${(v.duration_minutes ?? 0) * 60}s`,
                    },
                ],
            }));
            const startLocation = parseLocation(vehicle_start);
            const endLocation = vehicle_end ? parseLocation(vehicle_end) : startLocation;
            const body = {
                model: {
                    shipments,
                    vehicles: [
                        {
                            label: 'Vehicle 1',
                            travelMode: travel_mode === 'WALKING' ? 2 : 1,
                            startLocation,
                            endLocation,
                        },
                    ],
                },
            };
            const data = await optimizeTours(projectId, body);
            return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: 'text', text: String(err) }] };
        }
    });
}
