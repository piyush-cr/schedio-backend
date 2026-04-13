import "dotenv/config";
import multer from "multer";
import path from "path";
import fs from "fs";
import { uploadFile } from "./imagekit";

const uploadDir = path.join(__dirname, "../../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, "checkin-" + uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

export async function getFileUrl(filename: string): Promise<string> {
  if (!filename) {
    throw new Error("No file provided");
  }
  const result = await uploadFile(filename);

  if (!result.success) {
    throw new Error(result.error || "Failed to upload file to ImageKit");
  }

  console.log("File uploaded successfully to ImageKit");
  return result.secure_url || result.url!;
}
