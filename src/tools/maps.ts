import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildStaticMapUrl,
  buildStreetViewUrl,
  buildEmbedUrl,
  getElevation,
} from '../maps-client.js';

export function registerMapsTools(server: McpServer): void {

  // ── Static Map ─────────────────────────────────────────────────────────────
  server.registerTool(
    'maps_static_map',
    {
      title: 'Static Map Image',
      description:
        'Generate a URL for a static map image. Returns a direct image URL that can be viewed in a browser or embedded in a response. Useful for showing an overview of a location or area.',
      inputSchema: {
        center: z.string().max(500).describe("Address or 'lat,lng' (e.g. '48.8566,2.3522' or 'Paris, France')"),
        zoom: z.number().int().min(0).max(21).default(13).describe('Zoom level 0–21 (13 = city level)'),
        size: z.string().max(20).default('640x480').describe('Image dimensions WxH in pixels (max 640x640 on free tier)'),
        maptype: z.enum(['roadmap', 'satellite', 'terrain', 'hybrid']).default('roadmap').optional(),
        markers: z.string().max(1000).optional().describe("Marker spec e.g. 'color:red|label:A|48.8566,2.3522'"),
        path: z.string().max(1000).optional().describe("Path spec e.g. 'color:0xff0000ff|weight:5|48.8,2.3|48.9,2.4'"),
        format: z.enum(['png', 'png8', 'png32', 'gif', 'jpg']).default('png').optional(),
        scale: z.enum(['1', '2']).default('1').optional().describe('1 = standard, 2 = retina/HiDPI'),
        language: z.string().max(10).optional().describe('BCP 47 language code for map labels'),
        region: z.string().max(2).optional().describe('ISO 3166-1 alpha-2 region code'),
      },
    },
    async ({ center, zoom, size, maptype, markers, path, format, scale, language, region }) => {
      try {
        const url = buildStaticMapUrl({
          center,
          zoom: String(zoom),
          size,
          maptype,
          markers,
          path,
          format,
          scale,
          language,
          region,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ url }, null, 2),
            },
          ],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );

  // ── Embed URL ──────────────────────────────────────────────────────────────
  server.registerTool(
    'maps_embed_url',
    {
      title: 'Maps Embed URL',
      description:
        'Generate a Google Maps embed URL for placing an interactive map in an iframe. Supports place, directions, search, view, and streetview modes.',
      inputSchema: {
        mode: z.enum(['place', 'directions', 'search', 'view', 'streetview']).describe('Embed mode'),
        q: z.string().max(500).optional().describe('Place name/address or search query (place/search modes)'),
        center: z.string().max(50).optional().describe("'lat,lng' for view/streetview mode"),
        zoom: z.number().int().min(0).max(21).optional(),
        origin: z.string().max(500).optional().describe('Directions origin'),
        destination: z.string().max(500).optional().describe('Directions destination'),
        waypoints: z.string().max(1000).optional().describe('Pipe-separated waypoints for directions'),
        maptype: z.enum(['roadmap', 'satellite']).optional(),
        language: z.string().max(10).optional().describe('BCP 47 language code'),
        region: z.string().max(2).optional().describe('ISO 3166-1 alpha-2 region code'),
      },
    },
    async ({ mode, q, center, zoom, origin, destination, waypoints, maptype, language, region }) => {
      try {
        const embed_url = buildEmbedUrl(mode, {
          q,
          center,
          zoom: zoom !== undefined ? String(zoom) : undefined,
          origin,
          destination,
          waypoints,
          maptype,
          language,
          region,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ embed_url }, null, 2) }],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );

  // ── Elevation ──────────────────────────────────────────────────────────────
  server.registerTool(
    'maps_elevation',
    {
      title: 'Elevation Data',
      description:
        "Query elevation above sea level (in metres) for one or more locations, or along a path. Useful for understanding terrain when planning hikes, drives through mountains, etc.",
      inputSchema: {
        locations: z.string().max(2000).optional().describe(
          "Pipe-separated 'lat,lng' pairs e.g. '36.455,-116.866|36.445,-116.866'",
        ),
        path: z.string().max(2000).optional().describe(
          "Pipe-separated 'lat,lng' pairs defining a path (use with samples)",
        ),
        samples: z.number().int().min(2).max(512).optional().describe(
          'Number of evenly-spaced samples along path (required when path is set)',
        ),
      },
    },
    async ({ locations, path, samples }) => {
      try {
        if (!locations && !path) {
          throw new Error('Provide either locations or path');
        }
        const params: Record<string, string> = {};
        if (locations) params.locations = locations;
        if (path) params.path = path;
        if (samples !== undefined) params.samples = String(samples);
        const data = await getElevation(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );

  // ── Street View ────────────────────────────────────────────────────────────
  server.registerTool(
    'maps_street_view',
    {
      title: 'Street View Image',
      description:
        'Generate a URL for a static Google Street View panorama image. Returns a direct image URL. Great for giving users a ground-level preview of a destination.',
      inputSchema: {
        location: z.string().max(500).optional().describe("Address or 'lat,lng'"),
        pano: z.string().max(100).optional().describe('Specific panorama ID (overrides location)'),
        size: z.string().max(20).default('640x480').describe('Image size WxH in pixels'),
        heading: z.number().min(0).max(360).optional().describe('Camera compass heading 0–360'),
        pitch: z.number().min(-90).max(90).optional().describe('Camera pitch -90 (down) to 90 (up)'),
        fov: z.number().min(10).max(120).default(90).optional().describe('Field of view in degrees'),
        source: z.enum(['default', 'outdoor']).optional().describe(
          'outdoor = only outdoor panoramas',
        ),
      },
    },
    async ({ location, pano, size, heading, pitch, fov, source }) => {
      try {
        if (!location && !pano) throw new Error('Provide either location or pano');
        const url = buildStreetViewUrl({
          location,
          pano,
          size,
          heading: heading !== undefined ? String(heading) : undefined,
          pitch: pitch !== undefined ? String(pitch) : undefined,
          fov: fov !== undefined ? String(fov) : undefined,
          source,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ url }, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );
}
