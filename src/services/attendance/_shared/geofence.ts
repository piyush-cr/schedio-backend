import { Geofence, GeoPoint, isInsideGeofence } from "../../../lib/geofencing";

/**
 * Default office geofence radius in meters
 */
export const DEFAULT_GEOFENCE_RADIUS = 100;

/**
 * Check if a user location is inside the office geofence
 */
export function isUserInsideOfficeGeofence(
  userLat: number,
  userLng: number,
  officeLat: number,
  officeLng: number,
  radius: number = DEFAULT_GEOFENCE_RADIUS
): boolean {
  const userLocation: GeoPoint = {
    lat: userLat,
    lng: userLng,
  };

  const officeGeofence: Geofence = {
    center: {
      lat: officeLat,
      lng: officeLng,
    },
    radius,
  };

  return isInsideGeofence(userLocation, officeGeofence);
}
