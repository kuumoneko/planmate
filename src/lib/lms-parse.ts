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
const HAN_RE = /(?:hạn(?: nộp| cuối| chót)?|nộp(?: bài)?|deadline|due|đến ngày|thời hạn|hết hạn|trước ngày)/i;
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

const SYSTEM_PROMPT = `Bạn là một trợ lý AI chuyên phân tích văn bản và trích xuất dữ liệu lịch trình (Task/Deadline Extractor).

MỤC TIÊU:
Nhiệm vụ của bạn là đọc đoạn văn bản đầu vào, phát hiện tất cả các tác vụ (task), cuộc họp, mốc thời gian hoặc hạn chót (deadline), sau đó trích xuất chúng thành danh sách cấu trúc JSON chuẩn.

QUY TẮC TRÍCH XUẤT:
1. Chuẩn hóa ngày tháng: Chuyển đổi tất cả thời gian tương đối (ví dụ: "cuối tuần này", "thứ 2 tuần sau", "ngày mai", "sáng thứ 6") thành ngày cụ thể theo định dạng YYYY-MM-DD dựa trên MỐC THỜI GIAN HIỆN TẠI được cung cấp.
2. Nếu không đề cập giờ cụ thể, mặc định để \`time\`: "23:59".
3. Xác định mức độ ưu tiên (\`priority\`):
   - "High": Có từ ngữ khẩn cấp (gấp, quan trọng, asap, ngay) hoặc deadline trong vòng 24-48 giờ.
   - "Medium": Deadline bình thường (trong tuần/vài ngày tới).
   - "Low": Không gấp, kế hoạch dài hạn, ý tưởng linh hoạt.
4. Trích xuất đúng người thực hiện (\`assignee\`) nếu có tên riêng được giao việc trong bài. Nếu là công việc chung, để "Unassigned".
5. Mô tả công việc (\`task\`): Tóm tắt ngắn gọn, rõ ràng, bắt đầu bằng một động từ hành động.
6. Xác định môn học (\`courseName\`): nếu văn bản đề cập mã môn (ví dụ CO3001) hoặc tên môn học, trích xuất giá trị đó; nếu không xác định được, để "Chung".

ĐỊNH DẠNG ĐẦU RA (Chỉ trả về JSON thuần, không kèm lời dẫn hay markdown code block thừa nếu không yêu cầu):

{
  "reference_date": "YYYY-MM-DD",
  "deadlines": [
    {
      "task": "Tên/Mô tả ngắn gọn công việc",
      "due_date": "YYYY-MM-DD",
      "due_time": "HH:MM",
      "assignee": "Tên người thực hiện hoặc Unassigned",
      "priority": "High | Medium | Low",
      "courseName": "Tên/mã môn học hoặc Chung",
      "context": "Trích dẫn ngắn văn bản gốc liên quan đến task này"
    }
  ]
}

VÍ DỤ MẪU (FEW-SHOT):

[ĐẦU VÀO MẪU]
Mốc thời gian hiện tại: 2026-08-14 (Thứ Sáu)
Văn bản: "Hôm nay họp team xong thì Nam gửi báo cáo doanh thu trước 5h chiều nhé. Còn dự án Website mới thì tuần sau Thứ Ba team Dev phải xong bản Demo. Toàn bộ tài liệu Marketing thì Linh cố gắng hoàn thiện trước cuối tháng này."

[ĐẦU RA MẪU]
{
  "reference_date": "2026-08-14",
  "deadlines": [
    {
      "task": "Gửi báo cáo doanh thu",
      "due_date": "2026-08-14",
      "due_time": "17:00",
      "assignee": "Nam",
      "priority": "High",
      "courseName": "Chung",
      "context": "Nam gửi báo cáo doanh thu trước 5h chiều nhé"
    },
    {
      "task": "Hoàn thành bản Demo dự án Website mới",
      "due_date": "2026-08-18",
      "due_time": "23:59",
      "assignee": "Team Dev",
      "priority": "Medium",
      "courseName": "Chung",
      "context": "tuần sau Thứ Ba team Dev phải xong bản Demo"
    },
    {
      "task": "Hoàn thiện toàn bộ tài liệu Marketing",
      "due_date": "2026-08-31",
      "due_time": "23:59",
      "assignee": "Linh",
      "priority": "Low",
      "courseName": "Chung",
      "context": "Linh cố gắng hoàn thiện trước cuối tháng này"
    }
  ]
}`;

const DEADLINE_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        reference_date: { type: "STRING" },
        deadlines: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    task: { type: "STRING" },
                    due_date: { type: "STRING" },
                    due_time: { type: "STRING", nullable: true },
                    assignee: { type: "STRING", nullable: true },
                    priority: { type: "STRING", nullable: true },
                    courseName: { type: "STRING" },
                    context: { type: "STRING", nullable: true },
                },
                required: ["task", "due_date", "due_time", "assignee", "priority", "courseName", "context"],
            },
        },
    },
    required: ["reference_date", "deadlines"],
} as const;

/** Today's date, used as the reference point for relative dates. */
function referenceDate(): string {
    return new Date().toISOString().slice(0, 10);
}

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
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as any).deadlines)) {
        throw new Error("Gemini did not return a deadlines array");
    }
    return ((parsed as any).deadlines as any[])
        .map((item) => ({
            taskName: String(item?.task ?? "").trim(),
            dueDate: String(item?.due_date ?? "").trim(),
            dueTime: normalizeDueTime(item?.due_time),
            weight: null,
            courseName: String(item?.courseName ?? "Chung").trim() || "Chung",
            assignee: item?.assignee ? String(item.assignee).trim() : undefined,
            priority: item?.priority ? String(item.priority).trim() : undefined,
            context: item?.context ? String(item.context).trim() : undefined,
        }));
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
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: `
                        Bạn là một trợ lý AI chuyên phân tích văn bản và trích xuất dữ liệu lịch trình (Task/Deadline Extractor). 

MỤC TIÊU:
Nhiệm vụ của bạn là đọc đoạn văn bản đầu vào, phát hiện tất cả các tác vụ (task), cuộc họp, mốc thời gian hoặc hạn chót (deadline), sau đó trích xuất chúng thành danh sách cấu trúc JSON chuẩn.

QUY TẮC TRÍCH XUẤT:
1. Chuẩn hóa ngày tháng: Chuyển đổi tất cả thời gian tương đối (ví dụ: "cuối tuần này", "thứ 2 tuần sau", "ngày mai", "sáng thứ 6") thành ngày cụ thể theo định dạng YYYY-MM-DD dựa trên MỐC THỜI GIAN HIỆN TẠI được cung cấp.
2. Nếu không đề cập giờ cụ thể, mặc định để time: "23:59".
3. Xác định mức độ ưu tiên (priority):
   - "High": Có từ ngữ khẩn cấp (gấp, quan trọng, asap, ngay) hoặc deadline trong vòng 24-48 giờ.
   - "Medium": Deadline bình thường (trong tuần/vài ngày tới).
   - "Low": Không gấp, kế hoạch dài hạn, ý tưởng linh hoạt.
4. Trích xuất đúng người thực hiện (assignee) nếu có tên riêng được giao việc trong bài. Nếu là công việc chung, để "Unassigned".
5. Mô tả công việc (task): Tóm tắt ngắn gọn, rõ ràng, bắt đầu bằng một động từ hành động.

ĐỊNH DẠNG ĐẦU RA (Chỉ trả về JSON thuần, không kèm lời dẫn hay markdown code block thừa nếu không yêu cầu):

{
  "reference_date": "YYYY-MM-DD",
  "deadlines": [
    {
      "task": "Tên/Mô tả ngắn gọn công việc",
      "due_date": "YYYY-MM-DD",
      "due_time": "HH:MM",
      "assignee": "Tên người thực hiện hoặc Unassigned",
      "priority": "High | Medium | Low",
      "context": "Trích dẫn ngắn văn bản gốc liên quan đến task này"
    }
  ]
}

VÍ DỤ MẪU (FEW-SHOT):

[ĐẦU VÀO MẪU]
Mốc thời gian hiện tại: 2026-08-14 (Thứ Sáu)
Văn bản: "Hôm nay họp team xong thì Nam gửi báo cáo doanh thu trước 5h chiều nhé. Còn dự án Website mới thì tuần sau Thứ Ba team Dev phải xong bản Demo. Toàn bộ tài liệu Marketing thì Linh cố gắng hoàn thiện trước cuối tháng này."

[ĐẦU RA MẪU]
{
  "reference_date": "2026-08-14",
  "deadlines": [
    {
      "task": "Gửi báo cáo doanh thu",
      "due_date": "2026-08-14",
      "due_time": "17:00",
      "assignee": "Nam",
      "priority": "High",
      "context": "Nam gửi báo cáo doanh thu trước 5h chiều nhé"
    },
    {
      "task": "Hoàn thành bản Demo dự án Website mới",
      "due_date": "2026-08-18",
      "due_time": "23:59",
      "assignee": "Team Dev",
      "priority": "Medium",
      "context": "tuần sau Thứ Ba team Dev phải xong bản Demo"
    },
    {
      "task": "Hoàn thiện toàn bộ tài liệu Marketing",
      "due_date": "2026-08-31",
      "due_time": "23:59",
      "assignee": "Linh",
      "priority": "Low",
      "context": "Linh cố gắng hoàn thiện trước cuối tháng này"
    }
  ]
}

---
BẮT ĐẦU XỬ LÝ DỮ LIỆU THỰC TẾ:

Mốc thời gian hiện tại: [CHÈN NGÀY HÔM NAY VÀO ĐÂY, VD: YYYY-MM-DD]
Văn bản cần xử lý:
"""
${text}
"""`,
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
                        text: `Mốc thời gian hiện tại: ${referenceDate()}. Liệt kê tất cả các task, cuộc họp và hạn chót trong ảnh này theo đúng định dạng quy định (task, due_date, due_time, assignee, priority, courseName, context).`,
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