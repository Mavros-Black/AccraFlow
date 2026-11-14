import { test, expect } from "@playwright/test";
import { inspectGeojson } from "../lib/geojson-preflight";
const feature = (type: string, coordinates: unknown) => ({
  type: "Feature",
  properties: {},
  geometry: { type, coordinates },
});
const collection = (...features: unknown[]) => ({
  type: "FeatureCollection",
  features,
});

test("geospatial preflight checks geometry, coordinate bounds, and limits", () => {
  const valid = inspectGeojson(
    collection(
      feature("Point", [-0.21, 5.58]),
      feature("LineString", [
        [-0.21, 5.58],
        [-0.22, 5.59],
      ]),
      feature("Polygon", [
        [
          [-0.21, 5.58],
          [-0.22, 5.58],
          [-0.22, 5.59],
          [-0.21, 5.58],
        ],
      ]),
    ),
  );
  expect(valid.errorCount).toBe(0);
  expect(valid.geometryTypes).toEqual({ Point: 1, LineString: 1, Polygon: 1 });
  expect(valid.warnings.join(" ")).toContain(
    "does not verify polygon topology",
  );
  const invalid = inspectGeojson(
    collection(
      feature("Point", [250, 5]),
      feature("Polygon", [
        [
          [0, 5],
          [1, 5],
          [1, 6],
          [2, 5],
        ],
      ]),
      feature("GeometryCollection", []),
    ),
  );
  expect(invalid.errorCount).toBe(3);
  expect(invalid.errors.map((e) => e.message).join(" ")).toContain(
    "must be closed",
  );
  expect(
    inspectGeojson(collection(feature("Point", [0, 6]))).outsideAccraPositions,
  ).toBe(1);
  expect(
    inspectGeojson({
      type: "FeatureCollection",
      crs: {},
      features: [feature("Point", [-0.2, 5.6])],
    }).errorCount,
  ).toBe(1);
  expect(
    inspectGeojson(
      collection(...Array(2001).fill(feature("Point", [-0.2, 5.6]))),
    ).errors[0].message,
  ).toContain("feature limit");
  expect(
    inspectGeojson(
      collection(feature("LineString", Array(100001).fill([-0.2, 5.6]))),
    ).errors[0].message,
  ).toContain("coordinate limit");
});

test("user can check a local GeoJSON file and download its provenance report", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Infrastructure", exact: true })
    .first()
    .click();
  const tool = page.locator(".geo-preflight");
  await tool.getByLabel("GeoJSON file (maximum 5 MiB)").setInputFiles({
    name: "sample.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(
      JSON.stringify(collection(feature("Point", [-0.2, 5.6]))),
    ),
  });
  await tool.getByLabel("Source name").fill("Survey sample");
  await tool.getByLabel("Collection or survey date").fill("2025-01-15");
  await tool.getByLabel("License or permission").fill("Permission pending");
  await tool.getByRole("button", { name: "Check GeoJSON" }).click();
  await expect(
    tool.getByRole("heading", { name: "Structural preflight passed" }),
  ).toBeVisible();
  await expect(tool).toContainText("1 feature · 1 position checked");
  const download = page.waitForEvent("download");
  await tool.getByRole("button", { name: "Download preflight report" }).click();
  expect((await download).suggestedFilename()).toBe(
    "accraflow-geojson-preflight.json",
  );
  await tool.getByLabel("Source name").fill("Changed source");
  await expect(
    tool.getByRole("heading", { name: "Structural preflight passed" }),
  ).toHaveCount(0);
  await tool.getByLabel("GeoJSON file (maximum 5 MiB)").setInputFiles({
    name: "bad.geojson",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await tool.getByRole("button", { name: "Check GeoJSON" }).click();
  await expect(tool.getByRole("alert")).toContainText("valid JSON");
});
