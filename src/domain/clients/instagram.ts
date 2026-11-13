const HANDLE = /^[a-z0-9._]{1,30}$/;

/**
 * Normalizes an Instagram handle: accepts "@handle", "handle" and profile URLs.
 * Returns lowercase without "@", or null when invalid.
 */
export function normalizeInstagram(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  const url = value.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#\s]+)\/?(?:[?#].*)?$/);
  if (url) value = url[1];
  value = value.replace(/^@/, "");
  return HANDLE.test(value) ? value : null;
}
