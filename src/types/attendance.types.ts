
import { AttendanceStatus } from "./index";

export type AttendanceCreateInput = {
  userId: string;
  date: string;
  clockInTime?: number;
  clockInLat?: number;
  clockInLng?: number;
  clockInImageUrl?: string;
  clockOutTime?: number;
  clockOutLat?: number;
  clockOutLng?: number;
  clockOutImageUrl?: string;
  totalWorkMinutes?: number;
  status?: AttendanceStatus;
  metadata?: AttendanceMetadata;
};



export type AttendanceMetadata = {
  location?: {
    accuracy?: number;              // GPS accuracy (meters)
    distanceFromOffice?: number;    // Calculated server-side
    insideGeofence?: boolean;
  };

  capture?: {
    method?: "FRONT_CAMERA" | "MANUAL" | "AUTO";
    faceVerified?: boolean;
    imageQualityScore?: number;
  };

  device?: {
    deviceId?: string;
    platform?: "ANDROID" | "IOS" | "WEB";
    appVersion?: string;
  };

  autoCheckout?: {
    triggered?: boolean;
    reason?: "GEOFENCE_EXIT" | "SHIFT_END" | "SYSTEM";
    triggeredAt?: number;
  };

  audit?: {
    createdVia?: "USER_ACTION" | "BACKGROUND_TASK";
    isTampered?: boolean;
  };
};


export interface AttendanceFilter {
  userId?: string;
  date?: string;
  status?: AttendanceStatus;
  startDate?: string;
  endDate?: string;
  clockInTime?: { $exists: boolean } | null;
  clockOutTime?: { $exists: boolean } | null;
}

export type AttendanceUpdateInput = {
  clockInTime?: number;
  clockInLat?: number;
  clockInLng?: number;
  clockInImageUrl?: string;
  clockOutTime?: number;
  clockOutLat?: number;
  clockOutLng?: number;
  clockOutImageUrl?: string;
  totalWorkMinutes?: number;
  status?: AttendanceStatus;
  isAutoCheckOut?: boolean;
  geofenceBreachTime?: number | null;
  overtimeMinutes?: number;
  totalGeofenceBreachMinutes?: number;
  geofenceBreachedAt?: number | null;
};

export interface CheckInInput {
  userId: string;
  latitude: number;
  longitude: number;
  timestamp?: number;
  localFilePath?: string; // Local file path - will be uploaded by worker
  metadata?: AttendanceMetadata;
}

export interface CheckOutInput {
  userId: string;
  latitude: number;
  longitude: number;
  timestamp?: number;
  isAuto: boolean;
  localFilePath?: string;
  photoUrl?: string;
}
