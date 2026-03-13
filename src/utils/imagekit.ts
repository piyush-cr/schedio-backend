import "dotenv/config";
import ImageKit from "imagekit";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY || "",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || "",
});

export const uploadFile = async (fileUrlLocal: string) => {
    try {
        if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
            console.error("ImageKit configuration missing");
            return { success: false, error: "ImageKit configuration is missing" };
        }

        const fileName = path.basename(fileUrlLocal);
        const stats = fs.statSync(fileUrlLocal);
        const fileSizeInBytes = stats.size;
        const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);

        let fileContent: Buffer;

        if (fileSizeInMegabytes > 5) {
            console.log(`Compressing file as it exceeds 5MB: ${fileName} (${fileSizeInMegabytes.toFixed(2)}MB)`);
            fileContent = await sharp(fileUrlLocal)
                .rotate() // Auto-rotate based on EXIF data
                .resize({ width: 2000, withoutEnlargement: true }) // Reasonable maximum width
                .jpeg({ quality: 80, mozjpeg: true }) // High efficiency compression
                .toBuffer();
            console.log(`Compressed size: ${(fileContent.length / (1024 * 1024)).toFixed(2)}MB`);
        } else {
            fileContent = fs.readFileSync(fileUrlLocal);
        }

        const response = await imagekit.upload({
            file: fileContent, // required
            fileName: fileName, // required
            // You can specify folder if needed
            folder: "checkin-images"
        });

        console.log("ImageKit upload successful:", response.fileId);

        return {
            success: true,
            url: response.url,
            secure_url: response.url, // ImageKit returns 'url' which is HTTPS by default usually, but we match Cloudinary interface
            fileId: response.fileId,
            error: null
        };

    } catch (error: any) {
        console.error("ImageKit upload error:", error);
        return {
            success: false,
            error: error.message || "Unknown ImageKit error",
            url: null,
            secure_url: null
        };
    }
};
