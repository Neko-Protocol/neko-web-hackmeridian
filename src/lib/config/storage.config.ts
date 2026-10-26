/**
 * Images served from a public Supabase Storage bucket, so replacing one is an
 * upload instead of a deploy. The bucket holds the Neko Pro vault photos at
 * the root and the page banners under `banners/`.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");

export const PRO_IMAGES_BUCKET =
  process.env.NEXT_PUBLIC_PRO_IMAGES_BUCKET ?? "pro-images";

/**
 * Public URL for an object, or `undefined` when Supabase isn't configured —
 * callers fall back to whatever they already show without an image.
 */
export function publicStorageUrl(
  bucket: string,
  path: string
): string | undefined {
  if (!SUPABASE_URL) return undefined;
  const object = path.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${object}`;
}

/** An object in the Neko Pro bucket. */
export const proImageUrl = (path: string) =>
  publicStorageUrl(PRO_IMAGES_BUCKET, path);
