/**
 * Generates a realistic Vietnamese "BTL" (đồ án nhóm) deadline PDF for the
 * demo video: the new user uploads it to a group via "Nhập deadline".
 *
 * Dates are computed relative to TODAY so the demo always looks fresh.
 * Assignee names match the seeded demo members (scripts/seed-demo.ts) so the
 * review dialog auto-assigns them; "trưởng nhóm" tasks stay unassigned.
 *
 * Usage: bun run pdf:demo [--check]
 *   --check  re-extracts the PDF via the app's extractFileContent pipeline
 *            and prints the parsed deadlines (Gemini when a key is set,
 *            otherwise the regex parser).
 *
 * Font: Vietnamese-capable TTF (defaults to Windows fonts), overridable via
 * the PDF_FONT_PATH environment variable.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUTPUT = resolve(process.cwd(), "test/fixtures/demo-BTL-MT1009-deadlines.pdf");

const FONT_CANDIDATES: string[] = [
    process.env.PDF_FONT_PATH,
    "C:\\Windows\\Fonts\\segoeui.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
    "C:\\Windows\\Fonts\\times.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
].filter((p): p is string => typeof p === "string" && existsSync(p));

function pickFont(): Buffer {
    const path = FONT_CANDIDATES[0];
    if (!path) {
        throw new Error("Không tìm thấy font hỗ trợ tiếng Việt. Đặt PDF_FONT_PATH trỏ tới một file .ttf.");
    }
    console.log(`Font: ${path}`);
    return readFileSync(path);
}

/* ------------------------------ date helpers ------------------------------ */

function addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
}

function dmy(d: Date): string {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/* --------------------------------- content -------------------------------- */

interface Block {
    text: string;
    bold?: boolean;
    indent?: boolean;
}

function buildContent(now: Date): Block[] {
    const d = (days: number) => dmy(addDays(now, days));
    return [
        { text: "ĐỒ ÁN NHÓM - MT1009 GIẢI TÍCH 2 (BTL)", bold: true },
        { text: "Trường Đại học Bách Khoa - ĐHQG TP.HCM · Khoa Toán - Thống kê · HK 20261" },
        { text: "Giảng viên phụ trách: PGS.TS. Nguyễn Thị Minh Hạnh · Lớp: MT1009 · Nhóm 04" },
        { text: "Danh sách thành viên: Mai Ngọc Nhật (trưởng nhóm), Alex Nguyễn, Trần Thu Linh, Phan Quốc Minh." },
        { text: "" },
        { text: `Ngày bắt đầu học phần: ${d(0)}. Buổi học lý thuyết diễn ra vào thứ Ba hằng tuần tại phòng H6-302.` },
        { text: `Hạn nộp danh sách thành viên nhóm trên LMS: ${d(2)}, 23:59.` },
        { text: `Hạn đăng ký đề tài trên LMS: ${d(5)}, 23:59.` },
        { text: `Người thực hiện: Mai Ngọc Nhật - Khảo sát chuỗi Fourier của hàm tuần hoàn, hạn nộp báo cáo tuần 4: ${d(4)}, 23:59 (10%).` },
        { text: `Người thực hiện: Alex Nguyễn - Giải phương trình vi phân bằng chuỗi lũy thừa, hạn nộp: ${d(7)}, 23:59 (20%).` },
        { text: `Người thực hiện: Phan Quốc Minh - Tính tích phân bội bằng MATLAB, hạn nộp: ${d(10)}, 23:59 (20%).` },
        { text: `Người thực hiện: Trần Thu Linh - Viết báo cáo phần lý thuyết, hạn nộp: ${d(12)}, 23:59 (30%).` },
        { text: `Trưởng nhóm tổng hợp tài liệu và nộp BTL trên LMS, hạn nộp cuối: ${d(14)}, 23:59.` },
        { text: `Buổi demo tiến độ: ${d(11)}, 08:00 tại phòng H6-302 (không chấm điểm).` },
        { text: `Buổi bảo vệ đồ án: ${d(18)}. Ngày công bố điểm: ${d(25)}.` },
        { text: "" },
        { text: `Lưu ý: tất cả bài nộp qua LMS; bài nộp trễ quá 24 giờ sẽ không được chấm điểm.` },
    ];
}

/* ---------------------------------- layout -------------------------------- */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 64;
const MAX_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

function wrap(text: string, font: any, size: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= MAX_WIDTH || !line) {
            line = candidate;
        } else {
            lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

async function generate(): Promise<void> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const fontBytes = pickFont();
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });
    const bold = await pdfDoc.embedFont(fontBytes, { subset: true });

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let cursorY = PAGE_HEIGHT - MARGIN_TOP;

    for (const block of buildContent(new Date())) {
        const size = block.bold ? 15 : 12;
        const activeFont = block.bold ? bold : font;
        const lines = block.text ? wrap(block.text, activeFont, size) : [""];
        for (const line of lines) {
            if (cursorY < 60) {
                page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
                cursorY = PAGE_HEIGHT - MARGIN_TOP;
            }
            const width = activeFont.widthOfTextAtSize(line, size);
            const x = block.bold
                ? (PAGE_WIDTH - width) / 2
                : MARGIN_X + (block.indent ? 24 : 0);
            page.drawText(line, {
                x,
                y: cursorY,
                size,
                font: activeFont,
                color: block.bold ? rgb(0.08, 0.12, 0.28) : rgb(0.13, 0.13, 0.13),
            });
            cursorY -= block.bold ? 30 : 22;
        }
        if (!block.text) cursorY -= 10;
    }

    mkdirSync(resolve(process.cwd(), "test/fixtures"), { recursive: true });
    const bytes = await pdfDoc.save();
    await Bun.write(OUTPUT, bytes);
    console.log(`Generated: ${OUTPUT} (${bytes.length} bytes)`);
}

/* ----------------------------------- check -------------------------------- */

async function check(): Promise<void> {
    const buffer = await Bun.file(OUTPUT).arrayBuffer();
    const { extractFileContent } = await import("@/lib/file-to-text");
    const { parseLmsMarkdown } = await import("@/lib/lms-parse");

    const file = new File([buffer], "demo-BTL-MT1009-deadlines.pdf", { type: "application/pdf" });
    const extracted = await extractFileContent(file);
    if (extracted.kind !== "text") {
        console.error("FAIL: extraction did not produce text");
        process.exit(1);
    }
    const text = extracted.text;
    console.log(`\n--- extracted text (${text.length} chars) ---\n${text}\n`);

    const result = await parseLmsMarkdown(text);
    console.log(`--- parse result: ${result.deadlines.length} deadlines (${result.source}) ---`);
    for (const dl of result.deadlines) {
        console.log(
            `  [${dl.dueDate} ${dl.dueTime ?? "??:??"}] ${dl.taskName} | ${dl.assignee ?? "unassigned"} | ${dl.weight != null ? Math.round(dl.weight * 100) + "%" : "-"}`
        );
    }
    if (text.length < 100) {
        console.error("FAIL: text extraction too short");
        process.exit(1);
    }
    if (result.deadlines.length === 0) {
        console.error("FAIL: no deadlines parsed");
        process.exit(1);
    }
    console.log("\nCHECK OK");
}

await generate();
if (process.argv.includes("--check")) {
    await check();
}