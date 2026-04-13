import "dotenv/config";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const getImageKit = () => {
    const pub = process.env.IMAGEKIT_PUBLIC_KEY;
    const priv = process.env.IMAGEKIT_PRIVATE_KEY;
    const url = process.env.IMAGEKIT_URL_ENDPOINT;
    if (!pub || !priv || !url) return null;
    const ImageKit = require("imagekit");
    return new ImageKit({ publicKey: pub, privateKey: priv, urlEndpoint: url });
};

export const uploadFile = async (fileUrlLocal: string) => {
    const imagekit = getImageKit();
    if (!imagekit) {
        console.warn("ImageKit not configured — skipping upload");
        return { success: false, error: "ImageKit configuration is missing" };
    }
    try {
        const fileName = path.basename(fileUrlLocal);
        const stats = await fs.promises.stat(fileUrlLocal);
        const fileSizeMB = stats.size / (1024 * 1024);
        let transformer = sharp(fileUrlLocal).rotate();
        let metadata = await transformer.metadata();
        if (metadata.width && metadata.width > 1600) {
            transformer = transformer.resize({ width: 1600 });
        }
        let fileContent: Buffer;
        if (fileSizeMB > 5) {
            if (metadata.format === "png") {
                fileContent = await transformer.png({ compressionLevel: 9, palette: true }).toBuffer();
            } else {
                fileContent = await transformer.jpeg({ quality: 75, mozjpeg: true }).toBuffer();
            }
        } else {
            fileContent = await fs.promises.readFile(fileUrlLocal);
        }
        const response = await imagekit.upload({ file: fileContent, fileName, folder: "checkin-images" });
        return { success: true, url: response.url, fileId: response.fileId, error: null };
    } catch (error: any) {
        console.error("ImageKit upload error:", error);
        return { success: false, error: error.message || "Image upload failed", url: null };
    }
};
