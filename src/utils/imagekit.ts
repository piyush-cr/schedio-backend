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
    try {
        const imagekit = getImageKit();
        if (!imagekit) {
            console.warn("ImageKit not configured — skipping upload");
            return { success: false, error: "ImageKit configuration is missing" };
        }
        const fileName = path.basename(fileUrlLocal);
        const stats = fs.statSync(fileUrlLocal);
        const fileSizeInMegabytes = stats.size / (1024 * 1024);
        let fileContent: Buffer;
        if (fileSizeInMegabytes > 5) {
            fileContent = await sharp(fileUrlLocal)
                .rotate()
                .resize({ width: 2000, withoutEnlargement: true })
                .jpeg({ quality: 80, mozjpeg: true })
                .toBuffer();
        } else {
            fileContent = fs.readFileSync(fileUrlLocal);
        }
        const response = await imagekit.upload({ file: fileContent, fileName, folder: "checkin-images" });
        return { success: true, url: response.url, secure_url: response.url, fileId: response.fileId, error: null };
    } catch (error: any) {
        console.error("ImageKit upload error:", error);
        return { success: false, error: error.message || "Unknown ImageKit error", url: null, secure_url: null };
    }
};
