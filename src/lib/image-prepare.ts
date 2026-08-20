/**
 * Client-side image preparation for import dialogs (schedule/exam + group
 * deadlines). Normalizes a pasted/picked image for upload: re-encodes
 * webp/bmp/gif via canvas and downscales oversized screenshots (typical 4K
 * captures are megabytes — huge base64 POSTs fail at the network layer).
 * Small jpg/png pass through untouched.
 */

export const MAX_IMAGE_DIMENSION = 2000;
/** Refuse to upload payloads beyond this (base64 approx of the raw bytes). */
export const MAX_IMAGE_PAYLOAD_BYTES = 15 * 1024 * 1024;

export async function prepareImage(file: File): Promise<File> {
    if (typeof document === "undefined") return file;
    try {
        const url = URL.createObjectURL(file);
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error("Không đọc được ảnh"));
            el.src = url;
        });
        const scale = Math.min(
            1,
            MAX_IMAGE_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight)
        );
        if (
            scale === 1 &&
            (file.type === "image/png" || file.type === "image/jpeg")
        ) {
            URL.revokeObjectURL(url);
            return file;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return file;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const mime =
            file.type === "image/png" ? "image/png" : "image/jpeg";
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, mime, 0.9)
        );
        return blob
            ? new File(
                  [blob],
                  mime === "image/png" ? "import.png" : "import.jpg",
                  { type: mime }
              )
            : file;
    } catch {
        return file;
    }
}

export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const data = String(reader.result ?? "");
            resolve(data.slice(data.indexOf(",") + 1));
        };
        reader.onerror = () => reject(new Error("Không đọc được ảnh"));
        reader.readAsDataURL(file);
    });
}