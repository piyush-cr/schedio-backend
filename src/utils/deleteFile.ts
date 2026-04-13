import fs from "fs/promises";

export async function deleteLocalFile(filePath: string) {
  try {
    await fs.unlink(filePath);
    console.log("Local file deleted:", filePath);
  } catch (err) {
    console.error("Failed to delete file:", err);
    throw new Error("Failed to delete file")
  }

}
