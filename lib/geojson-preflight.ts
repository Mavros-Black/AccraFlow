export const MAX_GEOJSON_BYTES = 5 * 1024 * 1024;
const MAX_FEATURES = 2000;
const MAX_POSITIONS = 100000;
const MAX_MESSAGES = 30;
const ACCRA_BOUNDS = { west: -0.45, east: 0.1, south: 5.4, north: 5.85 };

type Issue = { feature: number | null; message: string };
export type GeojsonPreflight = {
  featureCount: number;
  positionCount: number;
  geometryTypes: Record<string, number>;
  outsideAccraPositions: number;
  errors: Issue[];
  errorCount: number;
  warnings: string[];
};

/** Structural preflight only. PostGIS validity and source approval remain required. */
export function inspectGeojson(input: unknown): GeojsonPreflight {
  const result: GeojsonPreflight = {
    featureCount: 0,
    positionCount: 0,
    geometryTypes: {},
    outsideAccraPositions: 0,
    errors: [],
    errorCount: 0,
    warnings: [],
  };
  const error = (feature: number | null, message: string) => {
    result.errorCount++;
    if (result.errors.length < MAX_MESSAGES)
      result.errors.push({ feature, message });
  };
  const obj = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  if (
    !obj(input) ||
    input.type !== "FeatureCollection" ||
    !Array.isArray(input.features)
  ) {
    error(null, "Expected a GeoJSON FeatureCollection with a features array.");
    return result;
  }
  if ("crs" in input)
    error(
      null,
      "Legacy CRS declarations are not supported. Supply RFC 7946 longitude/latitude GeoJSON.",
    );
  result.featureCount = input.features.length;
  if (!result.featureCount) error(null, "The feature collection is empty.");
  if (result.featureCount > MAX_FEATURES) {
    error(null, `The file exceeds the ${MAX_FEATURES} feature limit.`);
    return result;
  }
  let exceeded = false;
  const position = (value: unknown, index: number): boolean => {
    if (++result.positionCount > MAX_POSITIONS) {
      if (!exceeded)
        error(null, `The file exceeds the ${MAX_POSITIONS} coordinate limit.`);
      exceeded = true;
      return false;
    }
    if (
      !Array.isArray(value) ||
      value.length < 2 ||
      value.length > 3 ||
      !value.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      error(
        index,
        "A position must contain two or three finite numbers in longitude, latitude order.",
      );
      return false;
    }
    const [lon, lat] = value;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      error(
        index,
        "A longitude or latitude is outside valid geographic bounds.",
      );
      return false;
    }
    if (
      lon < ACCRA_BOUNDS.west ||
      lon > ACCRA_BOUNDS.east ||
      lat < ACCRA_BOUNDS.south ||
      lat > ACCRA_BOUNDS.north
    )
      result.outsideAccraPositions++;
    return true;
  };
  const line = (value: unknown, index: number, ring = false) => {
    if (!Array.isArray(value) || value.length < (ring ? 4 : 2)) {
      error(
        index,
        ring
          ? "A polygon ring needs at least four positions."
          : "A line needs at least two positions.",
      );
      return;
    }
    for (const point of value) {
      if (exceeded) break;
      position(point, index);
    }
    if (
      ring &&
      Array.isArray(value[0]) &&
      Array.isArray(value[value.length - 1])
    ) {
      const first = value[0],
        last = value[value.length - 1];
      if (
        first.length !== last.length ||
        first.some((number: unknown, i: number) => number !== last[i])
      )
        error(index, "A polygon ring must be closed.");
    }
  };
  const list = (
    value: unknown,
    index: number,
    item: (entry: unknown) => void,
  ) => {
    if (!Array.isArray(value) || !value.length) {
      error(index, "Geometry coordinates cannot be empty.");
      return;
    }
    for (const entry of value) {
      if (exceeded) break;
      item(entry);
    }
  };
  for (const [offset, feature] of input.features.entries()) {
    if (exceeded) break;
    const index = offset + 1;
    if (!obj(feature) || feature.type !== "Feature" || !obj(feature.geometry)) {
      error(index, "Expected a Feature with a non-null geometry.");
      continue;
    }
    if (feature.properties !== null && !obj(feature.properties))
      error(index, "Feature properties must be an object or null.");
    const geometry = feature.geometry;
    if (typeof geometry.type !== "string") {
      error(index, "Geometry type is missing.");
      continue;
    }
    const c = geometry.coordinates;
    switch (geometry.type) {
      case "Point":
        position(c, index);
        break;
      case "MultiPoint":
        list(c, index, (p) => {
          position(p, index);
        });
        break;
      case "LineString":
        line(c, index);
        break;
      case "MultiLineString":
        list(c, index, (l) => line(l, index));
        break;
      case "Polygon":
        list(c, index, (ring) => line(ring, index, true));
        break;
      case "MultiPolygon":
        list(c, index, (poly) =>
          list(poly, index, (ring) => line(ring, index, true)),
        );
        break;
      default:
        error(
          index,
          `Unsupported geometry type: ${geometry.type.slice(0, 80)}.`,
        );
        continue;
    }
    result.geometryTypes[geometry.type] =
      (result.geometryTypes[geometry.type] ?? 0) + 1;
  }
  if (result.outsideAccraPositions)
    result.warnings.push(
      `${result.outsideAccraPositions} positions lie outside the approximate Accra review bounds; check location and coordinate order.`,
    );
  result.warnings.push(
    "This structural check does not verify polygon topology, asset accuracy, coordinate reference history, license, or survey provenance. Professional review and database validation are still required.",
  );
  return result;
}
