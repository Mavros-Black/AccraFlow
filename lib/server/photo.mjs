import sharp from "sharp";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export class PhotoValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
/** Decode only allowed raster types and re-encode to strip EXIF/GPS metadata. */
export async function normalizeIncidentPhoto(input, contentType) {
  const expected = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  }[contentType];
  if (!expected)
    throw new PhotoValidationError("Choose a JPEG, PNG, or WebP image.", 415);
  if (!input.length) throw new PhotoValidationError("Image body required.");
  if (input.length > MAX_PHOTO_BYTES)
    throw new PhotoValidationError("Image exceeds 5 MiB.", 413);
  try {
    const source = sharp(input, {
      limitInputPixels: 20_000_000,
      failOn: "error",
    });
    const metadata = await source.metadata();
    if (metadata.format !== expected)
      throw new PhotoValidationError(
        "Image content does not match its type.",
        415,
      );
    const output = await source.rotate().jpeg({ quality: 82 }).toBuffer();
    if (output.length > MAX_PHOTO_BYTES)
      throw new PhotoValidationError("Processed image exceeds 5 MiB.", 413);
    return output;
  } catch (error) {
    if (error instanceof PhotoValidationError) throw error;
    throw new PhotoValidationError("Invalid or unsupported image.");
  }
}
