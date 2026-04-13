import z from "zod";

const latitudeSchema = z.preprocess((val) => {
  if (val === "" || val === "undefined" || val === "null" || val === null || val === undefined) return undefined;
  const n = Number(val);
  return isNaN(n) ? val : n;
}, z.number({ required_error: "Latitude is required" }).min(-90).max(90));

const longitudeSchema = z.preprocess((val) => {
  if (val === "" || val === "undefined" || val === "null" || val === null || val === undefined) return undefined;
  const n = Number(val);
  return isNaN(n) ? val : n;
}, z.number({ required_error: "Longitude is required" }).min(-180).max(180));
const timestampSchema = z.preprocess((val) => {
  if (val === "" || val === "undefined" || val === "null" || val === null || val === undefined) return undefined;
  const n = Number(val);
  return isNaN(n) ? val : n;
}, z.number().optional());

const attendanceMetadataSchema = z
  .object({
    location: z
      .object({
        accuracy: z.number().optional(),
        distanceFromOffice: z.number().optional(),
        insideGeofence: z.boolean().optional(),
      })
      .optional(),

    capture: z
      .object({
        method: z.enum(["FRONT_CAMERA", "MANUAL", "AUTO"]).optional(),
        faceVerified: z.boolean().optional(),
      })
      .optional(),

    device: z
      .object({
        platform: z.enum(["ANDROID", "IOS", "WEB"]).optional(),
        appVersion: z.string().optional(),
      })
      .optional(),
  })
  .optional();


const booleanSchema = z.preprocess((val) => {
  if (typeof val === "string") {
    const lowVal = val.toLowerCase().trim();
    if (lowVal === "true" || lowVal === "1") return true;
    if (lowVal === "false" || lowVal === "0" || lowVal === "") return false;
  }
  return val;
}, z.coerce.boolean());

const metadataSchema = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}, attendanceMetadataSchema);

export const checkInSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  timestamp: timestampSchema,
  metadata: metadataSchema,
});

export const checkOutSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  timestamp: timestampSchema,
  isAuto: booleanSchema.optional().default(false),
  metadata: metadataSchema,
});
