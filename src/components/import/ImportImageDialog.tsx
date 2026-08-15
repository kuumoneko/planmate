import { useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, ImageIcon, ClipboardPaste } from "lucide-react";

export interface ImportResult {
    count: number;
    summary: string;
}

/** Cap longest side when scaling screenshots down before upload. */
const MAX_DIMENSION = 2000;
/** Refuse to upload payloads beyond this (base64 approx of the raw bytes). */
const MAX_PAYLOAD_BYTES = 15 * 1024 * 1024;
/** Batch limit (matches the API). */
const MAX_IMAGES = 10;

/**
 * Normalize a pasted/picked image for upload: re-encode webp/bmp/gif via
 * canvas and downscale oversized screenshots (typical 4K captures are
 * megabytes — huge base64 POSTs fail at the network layer). Small jpg/png
 * pass through untouched.
 */
async function prepareImage(file: File): Promise<File> {
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
            MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight)
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

function fileToBase64(file: File): Promise<string> {
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

export default function ImportImageDialog({
    open,
    onOpenChange,
    kind,
    username,
    onImported,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    kind: "schedule" | "exam";
    username: string;
    onImported: (result: ImportResult) => void;
}) {
    const [year, setYear] = useState(String(new Date().getFullYear()));
    const [preview, setPreview] = useState<string | null>(null);
    const [queue, setQueue] = useState<File[]>([]);
    const [preparing, setPreparing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const isSchedule = kind === "schedule";
    const total = queue.length + (preparing ? 1 : 0);

    const reset = () => {
        setQueue([]);
        setPreview(null);
        setError(null);
        if (fileRef.current) fileRef.current.value = "";
    };

    const submitAll = async (files: File[]) => {
        setError(null);
        try {
            const images: { image: string; mimeType: string }[] = [];
            for (const file of files) {
                const base64 = await fileToBase64(file);
                if (base64.length * 0.75 > MAX_PAYLOAD_BYTES) {
                    setError(
                        "Ảnh quá lớn, hãy cắt bớt vùng thừa rồi thử lại"
                    );
                    reset();
                    return;
                }
                images.push({
                    image: base64,
                    mimeType:
                        file.type === "image/jpeg"
                            ? "image/jpeg"
                            : "image/png",
                });
            }
            setBusy(true);
            const res = await fetch("/api/import/parse", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    kind,
                    images,
                    username,
                    year: isSchedule ? Number(year) || undefined : undefined,
                }),
            });
            const json = await res.json();
            if (!json.ok) {
                setError(json.data ?? "Không phân tích được ảnh");
                reset();
                return;
            }
            onImported({
                count: json.data.count,
                summary: json.data.summary,
            });
            reset();
            onOpenChange(false);
        } catch (e: any) {
            const msg = String(e?.message ?? "");
            setError(
                e instanceof TypeError || /failed to fetch/i.test(msg)
                    ? "Không kết nối được máy chủ — hãy kiểm tra server và thử lại"
                    : (msg || "Không đọc được ảnh")
            );
            console.error("[import] upload failed:", e);
        } finally {
            setBusy(false);
        }
    };

    const handleImages = async (files: File[]) => {
        if (files.length === 0 || busy || preparing) return;
        setError(null);
        const take = files.slice(0, MAX_IMAGES);
        if (files.length > MAX_IMAGES) {
            setError(`Tối đa ${MAX_IMAGES} ảnh mỗi lần tải lên — chỉ lấy ${MAX_IMAGES} ảnh đầu.`);
        }
        setPreparing(true);
        const ready: File[] = [];
        try {
            for (let i = 0; i < take.length; i++) {
                ready.push(await prepareImage(take[i]));
            }
        } finally {
            setPreparing(false);
        }
        if (queue.length + ready.length > MAX_IMAGES) {
            setError(`Tối đa ${MAX_IMAGES} ảnh mỗi lần tải lên — chỉ giữ ${MAX_IMAGES} ảnh đầu.`);
        }
        setQueue((prev) => [...prev, ...ready].slice(0, MAX_IMAGES));
        setPreview(URL.createObjectURL(ready[0]));
    };

    useEffect(() => {
        if (!open) return;
        const onPaste = (e: ClipboardEvent) => {
            if (busy || preparing) return;
            const items = e.clipboardData?.items;
            if (!items) return;
            const files: File[] = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === "file" && item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            if (files.length === 0) return;
            e.preventDefault();
            void handleImages(files);
        };
        window.addEventListener("paste", onPaste);
        return () => window.removeEventListener("paste", onPaste);
    }, [open, busy, preparing]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {isSchedule ? "Tải lên lịch học" : "Tải lên lịch thi"}
                    </DialogTitle>
                    <DialogDescription>
                        Chụp màn hình bảng{" "}
                        {isSchedule ? "thời khoá biểu" : "lịch thi"} từ mybk
                        (jpg/png) rồi tải lên — hoặc sao chép ảnh (Ctrl+C) và
                        dán vào đây (Ctrl+V) — để tự động thêm vào lịch của
                        bạn. Có thể chọn hoặc dán nhiều ảnh, rồi bấm "Tải
                        lên" để gửi tất cả cùng lúc (tối đa 10 ảnh). Ảnh được
                        xử lý trên máy chủ, không lưu lại file.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <div>
                        <Label htmlFor="import-file">
                            Ảnh {isSchedule ? "thời khoá biểu" : "lịch thi"}
                        </Label>
                        <div
                            className="mt-1 flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-ring"
                            onClick={() => fileRef.current?.click()}
                        >
                            {preview ? (
                                <>
                                    <img
                                        src={preview}
                                        alt="Preview"
                                        className="h-full max-w-full rounded-lg object-contain"
                                    />
                                    {total > 1 && (
                                        <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-xs text-slate-100">
                                            {total} ảnh
                                        </span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <ImageIcon className="size-8" />
                                    <span className="text-sm">
                                        Nhấn để chọn ảnh hoặc dán ảnh đã sao
                                        chép (Ctrl+V)
                                    </span>
                                    <span className="flex items-center gap-1 text-xs">
                                        <ClipboardPaste className="size-3" />
                                        Dán ảnh đang dùng ngay khi mở hộp
                                        thoại
                                    </span>
                                </>
                            )}
                        </div>
                        <Input
                            id="import-file"
                            ref={fileRef}
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.bmp,.gif"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                const files = Array.from(
                                    e.target.files ?? []
                                );
                                if (files.length === 0) return;
                                void handleImages(files);
                            }}
                        />
                    </div>
                    {isSchedule && (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="import-year">Năm học</Label>
                            <Input
                                id="import-year"
                                type="number"
                                min={2020}
                                max={2035}
                                value={year}
                                disabled={busy || preparing}
                                onChange={(e) => setYear(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Năm dương lịch mà các tuần trong thời khoá
                                biểu thuộc về (dùng để tính ngày cụ thể cho
                                từng tuần).
                            </p>
                        </div>
                    )}
                    {preparing && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            Đang xử lý ảnh…
                        </p>
                    )}
                    {busy && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            Đang phân tích {total} ảnh bằng Gemini (có thể mất
                            1–2 phút)…
                        </p>
                    )}
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={busy || preparing}
                    >
                        Đóng
                    </Button>
                    <Button
                        onClick={() => void submitAll(queue)}
                        disabled={queue.length === 0 || busy || preparing}
                    >
                        {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {busy
                            ? "Đang phân tích…"
                            : `Tải lên ${queue.length} ảnh`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}