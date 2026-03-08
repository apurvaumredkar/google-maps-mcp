/**
 * Typed fetch wrappers for all Google Maps Platform REST APIs.
 *
 * Auth split:
 *   Legacy APIs (Static Maps, Street View, Geocoding, Elevation, Timezone)
 *     → ?key= query param
 *   New APIs (Places v1, Routes, Address Validation)
 *     → X-Goog-Api-Key header
 */
export declare function buildStaticMapUrl(params: Record<string, string | undefined>): string;
export declare function buildStreetViewUrl(params: Record<string, string | undefined>): string;
export declare function buildEmbedUrl(mode: string, params: Record<string, string | undefined>): string;
export declare function getElevation(params: Record<string, string>): Promise<unknown>;
export declare function geocode(params: Record<string, string>): Promise<unknown>;
export declare function getTimezone(params: Record<string, string>): Promise<unknown>;
export declare function getPlaceDetails(placeId: string, fieldMask: string, languageCode: string): Promise<unknown>;
export declare function textSearch(body: unknown, fieldMask: string): Promise<unknown>;
export declare function nearbySearch(body: unknown, fieldMask: string): Promise<unknown>;
export declare function autocomplete(body: unknown): Promise<unknown>;
export declare function getPlacePhotos(placeId: string, maxPhotos: number, maxWidthPx: number, maxHeightPx: number): Promise<unknown>;
export declare function validateAddress(body: unknown): Promise<unknown>;
export declare function computeRoutes(body: unknown, fieldMask: string): Promise<unknown>;
export declare function computeRouteMatrix(body: unknown, fieldMask: string): Promise<unknown>;
export declare function optimizeTours(projectId: string, body: unknown): Promise<unknown>;
export declare function parseWaypoint(input: string): unknown;
