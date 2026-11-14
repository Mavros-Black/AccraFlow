import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  MAX_PHOTO_BYTES,
  normalizeIncidentPhoto,
  PhotoValidationError,
} from "../lib/server/photo.mjs";

test("incident photos are decoded, re-encoded, and stripped of metadata", async () => {
  const source = await sharp({
    create: { width: 12, height: 8, channels: 3, background: "#27aabd" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const input = await sharp(source).metadata();
  assert.equal(input.orientation, 6);
  const output = await normalizeIncidentPhoto(source, "image/jpeg");
  const result = await sharp(output).metadata();
  assert.equal(result.format, "jpeg");
  assert.equal(result.exif, undefined);
  assert.equal(result.orientation, undefined);
  assert.equal(result.width, 8);
  assert.equal(result.height, 12);
});
test("incident photo validation rejects mismatched, unsupported, oversized, and malformed files", async () => {
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    () => normalizeIncidentPhoto(png, "image/jpeg"),
    (e) => e instanceof PhotoValidationError && e.status === 415,
  );
  await assert.rejects(
    () => normalizeIncidentPhoto(png, "image/svg+xml"),
    (e) => e instanceof PhotoValidationError && e.status === 415,
  );
  await assert.rejects(
    () =>
      normalizeIncidentPhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1), "image/jpeg"),
    (e) => e instanceof PhotoValidationError && e.status === 413,
  );
  await assert.rejects(
    () => normalizeIncidentPhoto(Buffer.from("not an image"), "image/jpeg"),
    (e) => e instanceof PhotoValidationError && e.status === 400,
  );
});
