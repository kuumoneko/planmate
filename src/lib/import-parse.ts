/**
 * Image import parsing for local accounts: Gemini vision turns a screenshot
 * of the mybk time-table ("Thời khoá biểu") or exam list ("Lịch thi") into
 * the same SubjectInfo[] / ExamInfo[] shapes the mybk sync produces, so the
 * schedule, day, exam pages and the dashboard all render the imported data.
 *
 * The mybk table shows days + week numbers (not absolute dates), so week
 * numbers are expanded to yyyy-mm-dd dates here, reusing the exact ISO-week
 * math from src/utils/data/hcmut/api/schedule.ts.
 */

import type { ExamInfo, SubjectInfo } from "@/types";
import {
    createGeminiClient,
    getGeminiModel,
    hasGeminiConfigured,
} from "@/lib/chat/gemini";

/* ------------------------- week -> dates ------------------------- */

/**
 * yyyy-mm-dd of the given ISO 8601 week and weekday (0 = Monday ... 6 =
 * Sunday), matching getDateFromWeek in src/utils/data/hcmut/api/schedule.ts.
 */
export function toIsoDate(year: number, week: number, dayOfWeek: number): string {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfJan4 = jan4.getUTCDay();

    const offsetToMonday = dayOfJan4 === 0 ? -6 : 1 - dayOfJan4;
    const firstMonday = new Date(jan4);
    firstMonday.setUTCDate(jan4.getUTCDate() + offsetToMonday);

    const targetMonday = new Date(firstMonday);
    targetMonday.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);

    const targetDate = new Date(targetMonday);
    targetDate.setUTCDate(targetMonday.getUTCDate() + dayOfWeek);
    return targetDate.toISOString().split("T")[0];
}

/* ------------------------- lesson -> time ------------------------- */

const LESSON_START_MINUTES: Record<number, number> = {
    1: 7 * 60, 2: 7 * 60 + 50, 3: 8 * 60 + 40, 4: 9 * 60 + 30,
    5: 10 * 60 + 20, 6: 11 * 60 + 10, 7: 13 * 60, 8: 13 * 60 + 50,
    9: 14 * 60 + 40, 10: 15 * 60 + 30, 11: 16 * 60 + 20, 12: 17 * 60 + 10,
    13: 18 * 60, 14: 18 * 60 + 50, 15: 19 * 60 + 40,
};

function minutesToTime(minutes: number): string {
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    return `${h}:${m}`;
}

/** "HH:MM" from a free-form time string; null when unparseable. */
function normalizeTime(value: string | undefined | null): string | null {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    const match = raw.match(/^(\d{1,2})[:h.](\d{1,2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return minutesToTime(hour * 60 + minute);
}

/** Derive start/end times from a lesson range like "1 - 3". */
function timeFromLesson(lesson: string): { startTime: string; endTime: string } | null {
    const nums = lesson.match(/\d+/g)?.map(Number);
    if (!nums || nums.length === 0) return null;
    const first = LESSON_START_MINUTES[nums[0]];
    const last = LESSON_START_MINUTES[nums[nums.length - 1]];
    if (first === undefined || last === undefined) return null;
    return { startTime: minutesToTime(first), endTime: minutesToTime(last + 50) };
}

/* ------------------------- Gemini schemas ------------------------- */

const SCHEDULE_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        entries: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    subject: { type: "STRING" },
                    teacher: { type: "STRING", nullable: true },
                    class: { type: "STRING" },
                    lesson: { type: "STRING", nullable: true },
                    startTime: { type: "STRING", nullable: true },
                    endTime: { type: "STRING", nullable: true },
                    dayOfWeek: { type: "INTEGER" },
                    weeks: {
                        type: "ARRAY",
                        items: { type: "INTEGER" },
                    },
                    building: { type: "STRING", nullable: true },
                    room: { type: "STRING", nullable: true },
                },
                required: ["subject", "class", "dayOfWeek", "weeks"],
            },
        },
    },
    required: ["entries"],
} as const;

const EXAM_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        entries: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    subject: { type: "STRING" },
                    date: { type: "STRING" },
                    building: { type: "STRING", nullable: true },
                    room: { type: "STRING", nullable: true },
                    startTime: { type: "STRING", nullable: true },
                    duration: { type: "STRING", nullable: true },
                    class: { type: "STRING", nullable: true },
                },
                required: ["subject", "date"],
            },
        },
    },
    required: ["entries"],
} as const;

/* ------------------------- parsing ------------------------- */

/** Normalize a mybk-style dayOfWeek (2=Mon .. 8=Sun, 0=no fixed day). */
function normalizeDayOfWeek(value: unknown): number {
    const n = Number(value);
    if (Number.isNaN(n)) return 2;
    if (n === 1) return 2; // calendar-style Monday
    if (n >= 2 && n <= 8) return n;
    return 2;
}

function normalizeWeeks(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return Array.from(
        new Set(
            value
                .map((w) => Number(w))
                .filter((w) => Number.isInteger(w) && w >= 1 && w <= 60)
        )
    ).sort((a, b) => a - b);
}

/** yyyy-mm-dd; tolerates dd/mm/yyyy. */
function normalizeDate(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    let iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
        const y = Number(iso[1]), m = Number(iso[2]), d = Number(iso[3]);
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    iso = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (iso) {
        const d = Number(iso[1]), m = Number(iso[2]), y = Number(iso[3]);
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    return null;
}

function mapScheduleEntry(
    item: any,
    year: number
): SubjectInfo | null {
    const subject = typeof item?.subject === "string" ? item.subject.trim() : "";
    const classCode = typeof item?.class === "string" ? item.class.trim() : "";
    if (!subject || !classCode) return null;

    const weeks = normalizeWeeks(item?.weeks);
    if (weeks.length === 0) return null;

    const dayOfWeek = normalizeDayOfWeek(item?.dayOfWeek);
    let startTime = normalizeTime(item?.startTime);
    let endTime = normalizeTime(item?.endTime);
    const lesson = typeof item?.lesson === "string" ? item.lesson.trim() : "";
    if (!startTime || !endTime) {
        const fromLesson = timeFromLesson(lesson);
        if (fromLesson) {
            startTime = startTime ?? fromLesson.startTime;
            endTime = endTime ?? fromLesson.endTime;
        }
    }
    if (!startTime || !endTime) return null;

    const dates =
        dayOfWeek === 0
            ? "--"
            : weeks.map((week) => toIsoDate(year, week, dayOfWeek - 2));

    return {
        subject,
        teacher: typeof item?.teacher === "string" ? item.teacher.trim() : "",
        class: classCode,
        lesson,
        startTime,
        endTime,
        dayOfWeek,
        weeks,
        building: typeof item?.building === "string" ? item.building.trim() : "",
        room: typeof item?.room === "string" ? item.room.trim() : "",
        dates,
    };
}

/** Normalize a duration ("90", "90 phút", "90 phut", "1 giờ 30") to "X phút". */
function normalizeDuration(value: unknown): string {
    if (typeof value !== "string") return "";
    const raw = value.trim();
    if (!raw) return "";
    if (/^\d{1,4}$/.test(raw)) return `${raw} phút`;
    return raw;
}

function mapExamEntry(item: any): ExamInfo | null {
    const subject = typeof item?.subject === "string" ? item.subject.trim() : "";
    const date = normalizeDate(item?.date);
    if (!subject || !date) return null;

    return {
        subject,
        date,
        building: typeof item?.building === "string" ? item.building.trim() : "",
        room: typeof item?.room === "string" ? item.room.trim() : "",
        startTime:
            normalizeTime(item?.startTime) ??
            (typeof item?.startTime === "string" ? item.startTime.trim() : ""),
        duration: normalizeDuration(item?.duration),
        class: typeof item?.class === "string" ? item.class.trim() : "",
    };
}

/**
 * Parse a screenshot of the mybk time-table into SubjectInfo[].
 * `year` is the calendar year the table's week numbers refer to.
 */
export async function parseScheduleFromImage(
    base64: string,
    mimeType: string,
    year: number
): Promise<SubjectInfo[]> {
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
                        text: `Đây là ảnh chụp trang "Thời khoá biểu" (lịch học) của sinh viên Đại học Bách Khoa TP.HCM từ hệ thống mybk. Bảng có các cột theo thứ tự: Học kỳ | Mã MH | Tên môn học | Tín chỉ | TC học phí | Nhóm - Tổ | Thứ | Tiết | Giờ học | Phòng | Cơ sở | Tuần học.

Ánh xạ từng cột vào kết quả:
- subject: cột "Tên môn học" (tên môn học, ví dụ Giải tích 1).
- class: cột "Mã MH" (mã môn học, ví dụ CO3001). Không dùng cột "Nhóm - Tổ".
- dayOfWeek: cột "Thứ". "T2" hoặc "Thứ Hai" = 2, "T3"/"Thứ Ba" = 3, "T4"/"Thứ Tư" = 4, "T5"/"Thứ Năm" = 5, "T6"/"Thứ Sáu" = 6, "T7"/"Thứ Bảy" = 7, "CN"/"Chủ Nhật" = 8. Nếu môn học không có ngày cố định (trực tuyến / tự học), dùng 0.
- lesson: cột "Tiết" (dãy tiết, ví dụ "1 - 3").
- startTime / endTime: cột "Giờ học" (định dạng "07:00 - 08:50" → startTime "07:00", endTime "08:50"). Nếu cột này trống, để trống và khai báo đúng lesson.
- room: cột "Phòng" (ví dụ H6-201), để trống nếu không có.
- building: cột "Cơ sở" (mã cơ sở, ví dụ H1, H6, LTK, DiAn), để trống nếu không có.
- weeks: cột "Tuần học". Các số là số tuần trong năm mà môn học có lớp. Dấu "-" hoặc ô trống nghĩa là tuần đó KHÔNG có lớp — tuyệt đối không đưa vào danh sách. "1-15" là khoảng liên tục (tuần 1 đến 15); "1-5,7-15" → [1,2,3,4,5,7,8,9,10,11,12,13,14,15]. Xuất danh sách các số tuần cụ thể, chỉ những tuần thực sự có lớp.

Bỏ qua hoàn toàn các cột "Học kỳ", "Tín chỉ", "TC học phí" và "Nhóm - Tổ". Bảng thời khoá biểu không có cột giảng viên — teacher luôn để trống.

Nếu một môn học có nhiều dòng (khác tiết, khác phòng, khác tuần), xuất mỗi dòng thành một entry riêng.

Bỏ qua tiêu đề trang, banner, chữ ký và ghi chú — chỉ đọc các dòng trong bảng thời khoá biểu. Không bịa thêm môn không có trong ảnh. Nếu ảnh không phải thời khoá biểu, trả entries rỗng.`,
                    },
                ],
            },
        ],
        config: {
            temperature: 0,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: SCHEDULE_RESPONSE_SCHEMA,
        },
    });

    let raw: any;
    try {
        raw = JSON.parse(response.text ?? "");
    } catch {
        throw new Error("Không đọc được kết quả từ Gemini, hãy thử ảnh rõ nét hơn");
    }
    const entries: any[] = Array.isArray(raw?.entries) ? raw.entries : [];
    return entries
        .map((item) => mapScheduleEntry(item, year))
        .filter((s): s is SubjectInfo => s !== null);
}

/**
 * Parse a screenshot of the mybk exam list ("Lịch thi") into ExamInfo[].
 */
export async function parseExamFromImage(
    base64: string,
    mimeType: string
): Promise<ExamInfo[]> {
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
                        text: `Đây là ảnh chụp trang "Lịch thi" của sinh viên Đại học Bách Khoa TP.HCM từ hệ thống mybk. Bảng có các cột theo thứ tự: Học kỳ | Môn học | Nhóm lớp | Ngày thi | Loại thi | Cơ sở | Mã phòng | Thứ | Giờ bắt đầu | Tổng số phút | Cập nhật cuối cùng vào lúc.

Ánh xạ từng cột vào kết quả:
- subject: cột "Môn học" (tên môn thi).
- class: cột "Nhóm lớp" (mã lớp học phần, ví dụ CO3001), để trống nếu không có.
- date: cột "Ngày thi". Trong ảnh hiển thị dạng dd/mm/yyyy — hãy xuất ra yyyy-mm-dd (ví dụ 15/12/2026 → 2026-12-15).
- startTime: cột "Giờ bắt đầu" dạng HH:MM (ví dụ "07:30"). Nếu cột này chỉ hiển thị ca thi (CA1, CA2, CA3, CA4) mà không có giờ cụ thể, ghi ca thi vào đây (ví dụ "CA2").
- duration: cột "Tổng số phút" (số phút thi, ví dụ 90) → xuất dạng "90 phút". Để trống nếu không có.
- building: cột "Cơ sở" (mã cơ sở, ví dụ H1, H6, LTK, DiAn). room: cột "Mã phòng" (ví dụ H1-301), để trống nếu không có.

Bỏ qua hoàn toàn các cột "Học kỳ", "Loại thi", "Thứ" và "Cập nhật cuối cùng vào lúc" — cột "Cập nhật cuối cùng vào lúc" là thời điểm cập nhật dữ liệu, KHÔNG phải ngày thi, tuyệt đối không dùng nó cho date.

Nếu một môn học chiếm nhiều dòng (nhiều nhóm lớp/ca), xuất mỗi dòng thành một entry riêng. Một ảnh có thể chứa lịch thi của nhiều học kỳ (ví dụ HK1, HK2, thi lại) — vẫn xuất tất cả các dòng.

Bỏ qua tiêu đề trang, banner, chữ ký và ghi chú — chỉ đọc các dòng trong bảng lịch thi. Không bịa thêm môn thi không có trong ảnh. Nếu ảnh không phải lịch thi, trả entries rỗng.`,
                    },
                ],
            },
        ],
        config: {
            temperature: 0,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: EXAM_RESPONSE_SCHEMA,
        },
    });

    let raw: any;
    try {
        raw = JSON.parse(response.text ?? "");
    } catch {
        throw new Error("Không đọc được kết quả từ Gemini, hãy thử ảnh rõ nét hơn");
    }
    const entries: any[] = Array.isArray(raw?.entries) ? raw.entries : [];
    return entries
        .map(mapExamEntry)
        .filter((e): e is ExamInfo => e !== null);
}