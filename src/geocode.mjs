// ZIP -> coordinates. Nothing is bundled: the first lookup for a ZIP asks a public
// geocoder and the answer is cached in data/zipcodes.json, so a given ZIP costs one
// request ever. 01960 ships in the cache so the site works before it ever has network.

const ZIP_PATTERN = /^\d{5}$/;
const ENDPOINT = "https://api.zippopotam.us/us";

export class ZipError extends Error {}

export function normalizeZip(value) {
  const zip = String(value ?? "").trim();
  return ZIP_PATTERN.test(zip) ? zip : null;
}

export async function lookupZip(value, { cache = {}, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const zip = normalizeZip(value);
  if (!zip) throw new ZipError(`"${String(value ?? "").trim()}" is not a five-digit US ZIP code.`);

  const cached = cache[zip];
  if (cached) return { zip, ...cached, fromCache: true };

  let payload;
  try {
    const response = await fetchImpl(`${ENDPOINT}/${zip}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 404) throw new ZipError(`No US ZIP code ${zip}.`);
    if (!response.ok) throw new ZipError(`Could not look up ${zip} right now (HTTP ${response.status}).`);
    payload = await response.json();
  } catch (error) {
    if (error instanceof ZipError) throw error;
    throw new ZipError(`Could not look up ${zip} right now. Check the connection and try again.`);
  }

  const place = payload?.places?.[0];
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  if (!place || Number.isNaN(latitude) || Number.isNaN(longitude)) throw new ZipError(`No usable location for ${zip}.`);

  const record = {
    latitude,
    longitude,
    place: [place["place name"], place["state abbreviation"]].filter(Boolean).join(", ")
  };
  cache[zip] = record;
  return { zip, ...record, fromCache: false };
}
