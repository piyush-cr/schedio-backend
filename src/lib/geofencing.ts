type Latitude = number;
type Longitude = number;
type Meters = number;

export function haversineDistance(
  lat1: Latitude,
  lng1: Longitude,
  lat2: Latitude,
  lng2: Longitude
): Meters {
  const R: Meters = 6371000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;

}

export interface GeoPoint {
  lat: Latitude;
  lng: Longitude;
}

export interface Geofence {
  center: GeoPoint;
  radius: Meters;
}

export function isInsideGeofence(
  user: GeoPoint,
  geofence: Geofence
): boolean {
  const distance = haversineDistance(
    user.lat,
    user.lng,
    geofence.center.lat,
    geofence.center.lng
  );

  return distance <= geofence.radius;

}


export function assertValidLatLng(lat: number, lng: number): void {
  if (lat < -90 || lat > 90) throw new Error("Invalid latitude");
  if (lng < -180 || lng > 180) throw new Error("Invalid longitude");
}
