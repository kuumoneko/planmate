/**
 * LMS paste parsing: Gemini structured output when the key is configured,
 * deterministic regex extraction otherwise. Both paths funnel through
 * `validateParsedDeadlines` so the dashboard always receives normalized data.
 */

import type { ParsedDeadline } from "@/types";
import {
    createGeminiClient,
    getGeminiModel,
    hasGeminiConfigured,
} from "@/lib/chat/gemini";

export type DeadlineSource = "gemini" | "regex";

export interface ParseResult {
    deadlines: ParsedDeadline[];
    source: DeadlineSource;
}

const COURSE_CODE_RE = /^\s*(?:#{1,6}\s*|\*\*\s*)?([A-Z]{2,4}\d{4})\b/;
const DATE_ISO_RE = /(\d{4})-(\d{1,2})-(\d{1,2})/;
const DATE_RE = /(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/;
const DATE_YEARLESS_RE = /(\d{1,2})[/-](\d{1,2})(?![/-]\d)/;
const HAN_RE = /(?:hạn|nộp|deadline|due|đến ngày|ngày)/i;
const WEIGHT_RE = /(\d{1,3})%|(?<![/\d.])(0\.\d+|1\.0+)(?![\d%])/;

/** One matched line inside a course block. */
interface RawTaskLine {
    text: string;
    dueDate: string; // yyyy-mm-dd (default year applied)
    weight: number | null;
}

/** Normalize a (possibly yearless) dd/mm[/yy] date to yyyy-mm-dd. */
export function toIsoDate(day: number, month: number, year: number): string {
    const y = year < 100 ? 2000 + year : year;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function currentYear(): number {
    return new Date().getFullYear();
}

/** Extract the weight from a task line ("30%", "0.3") — null when absent. */
export function extractWeight(text: string): number | null {
    const match = text.match(WEIGHT_RE);
    if (!match) return null;
    const raw = match[1] ?? match[2];
    const fraction = raw.endsWith("%") || /^\d{1,3}$/.test(raw)
        ? Number(raw) / 100
        : Number(raw);
    return Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : null;
}

/** Extract the due date from a task line; yearless dates use the current year. */
export function extractDueDate(text: string): string | null {
    const iso = text.match(DATE_ISO_RE); // 1=yyyy, 2=mm, 3=dd
    if (iso) {
        return toIsoDate(Number(iso[3]), Number(iso[2]), Number(iso[1]));
    }
    const slash = text.match(DATE_RE); // 1=dd, 2=mm, 3=yy
    if (slash) {
        const yy = Number(slash[3]);
        return toIsoDate(Number(slash[1]), Number(slash[2]), yy < 100 ? 2000 + yy : yy);
    }
    const yearless = text.match(DATE_YEARLESS_RE);
    if (yearless && HAN_RE.test(text)) {
        return toIsoDate(Number(yearless[1]), Number(yearless[2]), currentYear());
    }
    return null;
}

const TIME_24H_RE = /(?:^|[^\d:])([01]?\d|2[0-3]):([0-5]\d)(?!\d)/;
const TIME_12H_RE = /\b(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)\b/i;

/** Extract the due time ("23:59") from a task line; null when absent. */
export function extractDueTime(text: string): string | null {
    const twelve = text.match(TIME_12H_RE);
    if (twelve) {
        return normalizeDueTime(`${twelve[1]}:${twelve[2] ?? "00"} ${twelve[3]}`);
    }
    const military = text.match(TIME_24H_RE);
    if (military) {
        return `${String(Number(military[1])).padStart(2, "0")}:${military[2]}`;
    }
    return null;
}

/**
 * Deterministic parser for pasted LMS content. Course blocks are lines whose
 * leading text contains an HCMUT course code; task bullets beneath them carry
 * the due date. Used as the no-AI fallback.
 */
export function parseDeadlinesRegex(text: string): ParsedDeadline[] {
    const deadlines: ParsedDeadline[] = [];
    let courseName = "";
    let lastTaskName = "";
    let blocks = text.split(/\n+/);

    // Collapse bullet indentation and bullet markers to simplify line matching.
    // `*` is only treated as a bullet when not followed by another `*` so that
    // bold-markdown course headers like `**CO3001 - OOP**` survive.
    blocks = blocks.map((line) =>
        line.replace(/^\s*(?:-|•|·|\*(?!\*)|\d+[.)])\s*/, "").trim()
    );

    for (const line of blocks) {
        if (!line) continue;

        if (COURSE_CODE_RE.test(line)) {
            const code = line.match(COURSE_CODE_RE)![1];
            const rest = line
                .replace(COURSE_CODE_RE, "")
                .replace(/\*+/g, " ")
                .replace(/^[\s\-–—:]+/, "")
                .trim();
            courseName = rest.length > 0 ? `${code} - ${rest}` : code;
            lastTaskName = "";
            continue;
        }

        const dueDate = extractDueDate(line);
        if (!dueDate || !HAN_RE.test(line)) {
            lastTaskName = line;
            continue;
        }

        const weight = extractWeight(line);
        const taskName = line
            .replace(DATE_RE, " ")
            .replace(DATE_ISO_RE, " ")
            .replace(DATE_YEARLESS_RE, " ")
            .replace(TIME_24H_RE, " ")
            .replace(TIME_12H_RE, " ")
            .replace(WEIGHT_RE, " ")
            .replace(/(?:hạn|deadline|due|đến ngày|nộp(?: bài)?|ngày|lúc|trọng số|tỷ lệ)\s*[:：]?\s*-?\s*/gi, " ")
            .replace(/\s*\(\s*\)\s*/g, " ")
            .replace(/[^\w\sÀ-ỹđĐ.,()/#&-]/g, " ")
            .replace(/\s+/g, " ")
            .replace(/^[\s\-–—:：,]+|[\s\-–—:：,]+$/g, "")
            .trim();

        // Markdown nested bullets (`- Bài tập 1` / `  - hạn nộp: …`) put the
        // task name on the parent line: inherit it when the date line has none.
        const name = (taskName || lastTaskName)
            .replace(/\*+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!name) continue;

        deadlines.push({
            taskName: name,
            dueDate,
            dueTime: extractDueTime(line),
            weight,
            courseName: courseName || "Chung",
        });
        lastTaskName = name;
    }

    return deadlines;
}

const SYSTEM_PROMPT = [
    "Bạn là trợ lý trích xuất hạn nộp từ nội dung LMS (Moodle) của ĐHBK TP.HCM (HCMUT).",
    "Đọc đoạn văn bản người dùng dán từ trang bài tập trên LMS, liệt kê tất cả bài tập có hạn nộp.",
    "Nếu một bài tập không có ngày hạn cụ thể, hãy ước lượng ngày hợp lý gần nhất dựa trên ngữ cảnh và ghi chú của bài (ngày có thể là ước lượng).",
    "Mỗi mục phải có: taskName (tên bài tập), dueDate (định dạng yyyy-mm-dd), dueTime (giờ hạn nộp định dạng HH:mm nếu nguồn ghi rõ, ví dụ '23:59'; null nếu không có), weight (tỷ lệ điểm dạng số thập phân, ví dụ 30% -> 0.3; null nếu không có), courseName (mã môn nếu biết, nếu không thì tên môn học).",
    "taskName CHỈ là tiêu đề ngắn của bài tập (tối đa 120 ký tự). TUYỆT ĐỐI không dán toàn bộ nội dung/mô tả tài liệu vào taskName.",
    "Chỉ trả về JSON array, không thêm giải thích hay markdown.",
].join(" ");

const DEADLINE_RESPONSE_SCHEMA = {
    type: "ARRAY",
    items: {
        type: "OBJECT",
        properties: {
            taskName: { type: "STRING" },
            dueDate: { type: "STRING" },
            dueTime: { type: "STRING", nullable: true },
            weight: { type: "NUMBER", nullable: true },
            courseName: { type: "STRING" },
        },
        required: ["taskName", "dueDate", "dueTime", "weight", "courseName"],
    },
} as const;

/** Normalize a parsed deadline time to "HH:mm" (12h AM/PM accepted). */
export function normalizeDueTime(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    if (!raw) return null;
    const military = raw.match(/^([01]?\d|2[0-3]):(\d{1,2})$/);
    if (military) {
        const minute = Number(military[2]);
        if (minute > 59) return null;
        return `${String(Number(military[1])).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    const twelve = raw.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)$/i);
    if (twelve) {
        let hour = Number(twelve[1]);
        const minute = Number(twelve[2] ?? "0");
        const meridiem = twelve[3].toUpperCase();
        if (hour < 1 || hour > 12 || minute > 59) return null;
        if (meridiem === "PM" && hour !== 12) hour += 12;
        if (meridiem === "AM" && hour === 12) hour = 0;
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    return null;
}

/** Normalize a Gemini structured JSON response into parsed deadlines. */
function mapGeminiDeadlines(json: string): ParsedDeadline[] {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
        throw new Error("Gemini did not return an array of deadlines");
    }
    return parsed
        .map((item) => ({
            taskName: String((item as any).taskName ?? "").trim(),
            dueDate: String((item as any).dueDate ?? "").trim(),
            dueTime: normalizeDueTime((item as any).dueTime),
            weight: (item as any).weight == null ? null : Number((item as any).weight),
            courseName: String((item as any).courseName ?? "").trim(),
        }))
        .filter((d) => d.taskName && d.dueDate && d.courseName);
}

/** Gemini structured extraction; throws when the model output is unusable. */
export async function parseDeadlinesWithGemini(
    text: string,
    systemPrompt: string = SYSTEM_PROMPT
): Promise<ParsedDeadline[]> {
    const client = createGeminiClient();
    const model = getGeminiModel();
    console.log(
        `[lms-parse] calling Gemini model=${model} chars=${text.length}`
    );
    const startedAt = Date.now();
    const response = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text }] }],
        config: {
            temperature: 0,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            responseSchema: DEADLINE_RESPONSE_SCHEMA,
            systemInstruction: { parts: [{ text: systemPrompt }] },
        },
    });
    const elapsed = Date.now() - startedAt;
    const deadlines = mapGeminiDeadlines(response.text ?? "");
    console.log(
        `[lms-parse] Gemini done in ${elapsed}ms -> ${deadlines.length} deadlines` +
            (deadlines.length === 0 ? " (empty, will fall back to regex)" : "")
    );
    return deadlines;
}

/** Gemini vision extraction from an uploaded screenshot (jpg/png). */
export async function parseDeadlinesFromImage(
    base64: string,
    mimeType: string,
    systemPrompt: string = SYSTEM_PROMPT
): Promise<ParsedDeadline[]> {
    if (!hasGeminiConfigured()) {
        throw new Error("Chưa cấu hình GEMINI_API_KEY, không thể nhận dạng ảnh");
    }
    const client = createGeminiClient();
    const response = await client.models.generateContent({
        model: getGeminiModel(),
        contents: [
            {
                role: "user",
                parts: [
                    { inlineData: { mimeType, data: base64 } },
                    {
                        text: "Liệt kê tất cả bài tập có hạn nộp trong ảnh này (tên bài tập, ngày hạn nộp, tỷ lệ điểm, mã/tên môn học nếu có).",
                    },
                ],
            },
        ],
        config: {
            temperature: 0,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            responseSchema: DEADLINE_RESPONSE_SCHEMA,
            systemInstruction: { parts: [{ text: systemPrompt }] },
        },
    });
    return mapGeminiDeadlines(response.text ?? "");
}

/** Truncate a long name to `max` chars, appending an ellipsis. */
export function capTaskName(name: string, max = 120): string {
    const trimmed = name.trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max)}…`;
}

/** Normalize raw parsed deadlines: dates, times, weights, empties, caps. */
export function validateParsedDeadlines(deadlines: ParsedDeadline[]): ParsedDeadline[] {
    return deadlines.flatMap((d) => {
        const dueDate = normalizeDateString(d.dueDate);
        if (!dueDate || !d.taskName?.trim() || !d.courseName?.trim()) return [];
        const weight =
            d.weight != null && Number.isFinite(d.weight)
                ? Math.min(Math.max(d.weight, 0), 1)
                : d.weight;
        return [{
            ...d,
            taskName: capTaskName(d.taskName),
            courseName: capTaskName(d.courseName, 60),
            dueDate,
            dueTime: normalizeDueTime(d.dueTime),
            weight,
        }];
    });
}

/** Accepts yyyy-mm-dd, dd/mm/yyyy, dd/mm (yearless -> current year). */
export function normalizeDateString(value: string): string | null {
    const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
        ?? value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
        ?? value.trim().match(/^(\d{1,2})[/-](\d{1,2})$/);
    if (!match) return null;
    // ISO form: y-m-d ; slash form: d/m/y or d/m
    const [d, m, y] = match[1].length === 4
        ? [Number(match[3]), Number(match[2]), Number(match[1])]
        : [Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : currentYear()];
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return toIsoDate(d, m, y);
}

/** Full pipeline: Gemini when configured, regex otherwise. */
export async function parseLmsMarkdown(text: string): Promise<ParseResult> {
    const trimmed = text.trim();
    if (!trimmed) {
        throw new Error("text is required");
    }

    if (hasGeminiConfigured()) {
        try {
            const deadlines = await parseDeadlinesWithGemini(trimmed);
            const validated = validateParsedDeadlines(deadlines);
            if (validated.length > 0) {
                return { deadlines: validated, source: "gemini" };
            }
        } catch (error) {
            console.warn("[lms-parse] Gemini failed, falling back to regex:", error);
        }
    }

    const startedAt = Date.now();
    const deadlines = validateParsedDeadlines(parseDeadlinesRegex(trimmed));
    console.log(
        `[lms-parse] regex fallback done in ${Date.now() - startedAt}ms -> ${deadlines.length} deadlines`
    );
    return { deadlines, source: "regex" };
}