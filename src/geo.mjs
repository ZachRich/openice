const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance. Straight-line, not drive time — see the caveat in the UI. */
export function distanceMiles(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some(value => typeof value !== "number" || Number.isNaN(value))) return null;
  const radians = value => value * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return Math.round(EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}
