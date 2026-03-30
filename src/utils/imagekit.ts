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
    if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
        throw new Error("ImageKit configuration missing");
    }

    try {
        const fileName = path.basename(fileUrlLocal);

        const stats = await fs.promises.stat(fileUrlLocal);
        const fileSizeMB = stats.size / (1024 * 1024);

        let transformer = sharp(fileUrlLocal).rotate();
        let metadata = await transformer.metadata();

        // ✅ Resize only if too large
        if (metadata.width && metadata.width > 1600) {
            transformer = transformer.resize({ width: 1600 });
        }

        let fileContent: Buffer;

        if (fileSizeMB > 5) {
            console.log(`Compressing ${fileName} (${fileSizeMB.toFixed(2)}MB)`);

            // ✅ Format-aware compression
            if (metadata.format === "png") {
                fileContent = await transformer
                    .png({ compressionLevel: 9, palette: true })
                    .toBuffer();
            } else {
                fileContent = await transformer
                    .jpeg({ quality: 75, mozjpeg: true })
                    .toBuffer();
            }

            console.log(`Compressed: ${(fileContent.length / (1024 * 1024)).toFixed(2)}MB`);
        } else {
            fileContent = await fs.promises.readFile(fileUrlLocal);
        }

        const response = await imagekit.upload({
            file: fileContent,
            fileName,
            folder: "checkin-images",
        });

        return {
            url: response.url,
            fileId: response.fileId,
        };

    } catch (error: any) {
        console.error("ImageKit upload error:", error);
        throw new Error(error.message || "Image upload failed");
    }
};