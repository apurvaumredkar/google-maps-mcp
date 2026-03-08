import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  geocode,
  getTimezone,
  getPlaceDetails,
  textSearch,
  nearbySearch,
  autocomplete,
  getPlacePhotos,
  validateAddress,
} from '../maps-client.js';

const PLACE_FIELD_MASK =
  'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,types,' +
  'currentOpeningHours,websiteUri,nationalPhoneNumber,photos,editorialSummary,accessibilityOptions';

export function registerPlacesTools(server: McpServer): void {

  // ── Geocoding ──────────────────────────────────────────────────────────────
  server.registerTool(
    'places_geocode',
    {
      title: 'Geocode Address',
      description:
        "Convert a human-readable address to coordinates (lat/lng) or vice versa. Also returns the place_id which can be used with other places tools. Essential first step for many location-based queries.",
      inputSchema: {
        address: z.string().optional().describe('Address to geocode'),
        latlng: z.string().optional().describe("'lat,lng' string for reverse geocoding"),
        language: z.string().default('en').optional(),
        region: z.string().optional().describe('ISO 3166-1 alpha-2 region bias code'),
        components: z.string().optional().describe(
          "Component filter e.g. 'country:FR|postal_code:75001'",
        ),
      },
    },
    async ({ address, latlng, language, region, components }) => {
      try {
        if (!address && !latlng) throw new Error('Provide either address or latlng');
        const params: Record<string, string> = { language: language ?? 'en' };
        if (address) params.address = address;
        if (latlng) params.latlng = latlng;
        if (region) params.region = region;
        if (components) params.components = components;
        const data = await geocode(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );

  // ── Place Details ──────────────────────────────────────────────────────────
  server.registerTool(
    'places_details',
    {
      title: 'Place Details',
      description:
        'Get rich details about a specific place using its Google Place ID. Returns name, address, rating, phone, website, hours, photos, and more. Use after a search to get full info about a place.',
      inputSchema: {
        place_id: z.string().describe("Google Place ID (e.g. from places_text_search results)"),
        fields: z.string().default(PLACE_FIELD_MASK).optional().describe(
          'Comma-separated field mask. Defaults to a comprehensive set of useful fields.',
        ),
        language_code: z.string().default('en').optional(),
      },
    },
    async ({ place_id, fields, language_code }) => {
      try {
        const data = await getPlaceDetails(
          place_id,
          fields ?? PLACE_FIELD_MASK,
          language_code ?? 'en',
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );

  // ── Text Search ────────────────────────────────────────────────────────────
  server.registerTool(
    'places_text_search',
    {
      title: 'Search Places by Text',
      description:
        "Find places matching a text query, optionally biased toward a location. Great for queries like 'best ramen in Tokyo' or 'rooftop bars near Colosseum Rome'. Returns name, address, rating, and place IDs for follow-up details.",
      inputSchema: {
        query: z.string().describe("Search query e.g. 'romantic restaurants near Eiffel Tower'"),
        location_bias_lat: z.number().optional().describe('Latitude to bias results toward'),
        location_bias_lng: z.number().optional().describe('Longitude to bias results toward'),
        location_bias_radius_m: z.number().optional().describe('Bias circle radius in metres'),
        max_results: z.number().int().min(1).max(20).default(10).optional(),
        language_code: z.string().default('en').optional(),
        min_rating: z.number().min(0).max(5).optional().describe('Minimum average rating'),
        open_now: z.boolean().optional().describe('Only return currently open places'),
        included_type: z.string().optional().describe(
          "Filter by a single primary place type e.g. 'restaurant', 'museum', 'hotel'",
        ),
        price_levels: z.array(
          z.enum([
            'PRICE_LEVEL_FREE',
            'PRICE_LEVEL_INEXPENSIVE',
            'PRICE_LEVEL_MODERATE',
            'PRICE_LEVEL_EXPENSIVE',
            'PRICE_LEVEL_VERY_EXPENSIVE',
          ]),
        ).optional(),
      },
    },
    async ({
      query,
      location_bias_lat,
      location_bias_lng,
      location_bias_radius_m,
      max_results,
      language_code,
      min_rating,
      open_now,
      included_type,
      price_levels,
    }) => {
      try {
        const body: Record<string, unknown> = {
          textQuery: query,
          pageSize: max_results ?? 10,
          languageCode: language_code ?? 'en',
        };

        if (location_bias_lat !== undefined && location_bias_lng !== undefined) {
          body.locationBias = {
            circle: {
              center: { latitude: location_bias_lat, longitude: location_bias_lng },
              radius: location_bias_radius_m ?? 5000,
            },
          };
        }
        if (min_rating !== undefined) body.minRating = min_rating;
        if (open_now !== undefined) body.openNow = open_now;
        if (included_type) body.includedType = included_type;
        if (price_levels && price_levels.length > 0) body.priceLevels = price_levels;

        const fieldMask =
          'places.id,places.displayName,places.formattedAddress,places.location,' +
          'places.rating,places.userRatingCount,places.priceLevel,places.types,' +
          'places.currentOpeningHours.openNow,places.websiteUri,places.editorialSummary';

        const data = await textSearch(body, fieldMask);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );

  // ── Nearby Search ──────────────────────────────────────────────────────────
  server.registerTool(
    'places_nearby_search',
    {
      title: 'Search Nearby Places',
      description:
        "Find places near a specific lat/lng coordinate within a given radius. Perfect for 'what's around here?' queries during trip planning.",
      inputSchema: {
        latitude: z.number().describe('Center latitude'),
        longitude: z.number().describe('Center longitude'),
        radius_m: z.number().min(1).max(50000).describe('Search radius in metres (max 50,000)'),
        included_types: z.array(z.string()).optional().describe(
          "Place type filters e.g. ['restaurant','cafe','tourist_attraction']",
        ),
        excluded_types: z.array(z.string()).optional(),
        max_results: z.number().int().min(1).max(20).default(10).optional(),
        language_code: z.string().default('en').optional(),
        rank_preference: z.enum(['DISTANCE', 'POPULARITY']).default('POPULARITY').optional(),
      },
    },
    async ({
      latitude,
      longitude,
      radius_m,
      included_types,
      excluded_types,
      max_results,
      language_code,
      rank_preference,
    }) => {
      try {
        const body: Record<string, unknown> = {
          locationRestriction: {
            circle: {
              center: { latitude, longitude },
              radius: radius_m,
            },
          },
          maxResultCount: max_results ?? 10,
          languageCode: language_code ?? 'en',
          rankPreference: rank_preference ?? 'POPULARITY',
        };
        if (included_types && included_types.length > 0) body.includedTypes = included_types;
        if (excluded_types && excluded_types.length > 0) body.excludedTypes = excluded_types;

        const fieldMask =
          'places.id,places.displayName,places.formattedAddress,places.location,' +
          'places.rating,places.userRatingCount,places.priceLevel,places.types,' +
          'places.currentOpeningHours.openNow,places.websiteUri';

        const data = await nearbySearch(body, fieldMask);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );

  // ── Autocomplete ───────────────────────────────────────────────────────────
  server.registerTool(
    'places_autocomplete',
    {
      title: 'Place Autocomplete',
      description:
        'Get place name predictions as the user types — useful for building search suggestions or clarifying ambiguous location names before calling other tools.',
      inputSchema: {
        input: z.string().describe('Partial text to autocomplete'),
        location_bias_lat: z.number().optional(),
        location_bias_lng: z.number().optional(),
        location_bias_radius_m: z.number().optional().describe('Bias radius in metres'),
        included_primary_types: z.array(z.string()).optional().describe(
          "Filter by primary type e.g. ['lodging','restaurant']",
        ),
        country_codes: z.array(z.string()).optional().describe('ISO 3166-1 alpha-2 country codes'),
        language_code: z.string().default('en').optional(),
        include_query_predictions: z.boolean().default(false).optional(),
      },
    },
    async ({
      input,
      location_bias_lat,
      location_bias_lng,
      location_bias_radius_m,
      included_primary_types,
      country_codes,
      language_code,
      include_query_predictions,
    }) => {
      try {
        const body: Record<string, unknown> = {
          input,
          languageCode: language_code ?? 'en',
          includeQueryPredictions: include_query_predictions ?? false,
        };
        if (location_bias_lat !== undefined && location_bias_lng !== undefined) {
          body.locationBias = {
            circle: {
              center: { latitude: location_bias_lat, longitude: location_bias_lng },
              radius: location_bias_radius_m ?? 5000,
            },
          };
        }
        if (included_primary_types && included_primary_types.length > 0) {
          body.includedPrimaryTypes = included_primary_types;
        }
        if (country_codes && country_codes.length > 0) {
          body.includedRegionCodes = country_codes;
        }

        const data = await autocomplete(body);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );

  // ── Place Photos ───────────────────────────────────────────────────────────
  server.registerTool(
    'places_photos',
    {
      title: 'Place Photos',
      description:
        'Get photo URLs for a place. Returns direct image URLs you can view in a browser. Perfect for visually previewing a hotel, restaurant, or attraction before visiting.',
      inputSchema: {
        place_id: z.string().describe('Google Place ID'),
        max_photos: z.number().int().min(1).max(10).default(3).optional(),
        max_width_px: z.number().int().min(1).max(4800).default(1200).optional(),
        max_height_px: z.number().int().min(1).max(4800).default(900).optional(),
      },
    },
    async ({ place_id, max_photos, max_width_px, max_height_px }) => {
      try {
        const data = await getPlacePhotos(
          place_id,
          max_photos ?? 3,
          max_width_px ?? 1200,
          max_height_px ?? 900,
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );

  // ── Address Validation ─────────────────────────────────────────────────────
  server.registerTool(
    'places_address_validation',
    {
      title: 'Validate Address',
      description:
        'Validate and standardize a postal address. Returns a verdict (CONFIRMED, UNCONFIRMED_BUT_PLAUSIBLE, etc.), the corrected address, and details about any missing or inferred components. Useful before booking or navigation.',
      inputSchema: {
        address_lines: z.array(z.string()).min(1).describe(
          "Address lines e.g. ['1600 Amphitheatre Pkwy', 'Mountain View, CA 94043']",
        ),
        region_code: z.string().optional().describe('ISO 3166-1 alpha-2 country code'),
        locality: z.string().optional().describe('City/town'),
        administrative_area: z.string().optional().describe('State/province/region'),
        postal_code: z.string().optional(),
        enable_usps_cass: z.boolean().default(false).optional().describe(
          'Enable USPS CASS validation (US addresses only)',
        ),
      },
    },
    async ({ address_lines, region_code, locality, administrative_area, postal_code, enable_usps_cass }) => {
      try {
        const postalAddress: Record<string, unknown> = { addressLines: address_lines };
        if (region_code) postalAddress.regionCode = region_code;
        if (locality) postalAddress.locality = locality;
        if (administrative_area) postalAddress.administrativeArea = administrative_area;
        if (postal_code) postalAddress.postalCode = postal_code;

        const body: Record<string, unknown> = { address: { postalAddress } };
        if (enable_usps_cass) body.enableUspsCass = true;

        const data = await validateAddress(body);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );

  // ── Timezone ───────────────────────────────────────────────────────────────
  server.registerTool(
    'places_timezone',
    {
      title: 'Get Timezone',
      description:
        "Get timezone information for any coordinates on Earth. Returns the IANA timezone ID, timezone name, UTC offset, and DST offset. Useful for scheduling across time zones when planning trips.",
      inputSchema: {
        latitude: z.number().describe('Latitude'),
        longitude: z.number().describe('Longitude'),
        timestamp: z.number().int().optional().describe(
          'Unix timestamp (seconds since epoch) — determines DST offset. Defaults to now.',
        ),
        language: z.string().default('en').optional(),
      },
    },
    async ({ latitude, longitude, timestamp, language }) => {
      try {
        const ts = timestamp ?? Math.floor(Date.now() / 1000);
        const data = await getTimezone({
          location: `${latitude},${longitude}`,
          timestamp: String(ts),
          language: language ?? 'en',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: String(err) }] };
      }
    },
  );
}
