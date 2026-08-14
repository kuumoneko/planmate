/**
 * Lightweight intent classifier for the NL chat endpoints.
 *
 * Works on diacritic-folded Vietnamese + English text (keyword matching),
 * so it survives typos in accents. It is intentionally dumb: the classifier
 * only decides WHAT the message is about so the API routes can attach the
 * right context/actions; the actual answering is done by the LLM.
 */

export type ChatIntent =
    | "schedule"
    | "exams"
    | "lms"
    | "group-free-time"
    | "group-tasks"
    | "ics-export"
    | "general";

export interface IntentResult {
    intent: ChatIntent;
    /** Keywords matched, diacritic-folded and lowercased. */
    matches: string[];
    /** Per-intent hit counts (for debugging / confidence). */
    scores: Partial<Record<ChatIntent, number>>;
}

const VIETNAMESE_FOLD: Record<string, string> = {
    à: "a", á: "a", ả: "a", ã: "a", ạ: "a", ă: "a", ằ: "a", ắ: "a", ẳ: "a", ẵ: "a", ặ: "a",
    â: "a", ầ: "a", ấ: "a", ẩ: "a", ẫ: "a", ậ: "a",
    è: "e", é: "e", ẻ: "e", ẽ: "e", ẹ: "e", ê: "e", ề: "e", ế: "e", ể: "e", ễ: "e", ệ: "e",
    ì: "i", í: "i", ỉ: "i", ĩ: "i", ị: "i",
    ò: "o", ó: "o", ỏ: "o", õ: "o", ọ: "o", ô: "o", ồ: "o", ố: "o", ổ: "o", ỗ: "o", ộ: "o",
    ơ: "o", ờ: "o", ớ: "o", ở: "o", ỡ: "o", ợ: "o",
    ù: "u", ú: "u", ủ: "u", ũ: "u", ụ: "u", ư: "u", ừ: "u", ứ: "u", ử: "u", ữ: "u", ự: "u",
    ỳ: "y", ý: "y", ỷ: "y", ỹ: "y", ỵ: "y",
    đ: "d",
};

/** Strip Vietnamese diacritics (à -> a, ư -> u, đ -> d, ...) and lowercase. */
export function foldDiacritics(input: string): string {
    return input
        .toLowerCase()
        .split("")
        .map((ch) => VIETNAMESE_FOLD[ch] ?? ch)
        .join("");
}

interface IntentRule {
    intent: ChatIntent;
    keywords: string[];
}

/** Ordered by priority: earlier intents win ties on equal hit counts. */
const RULES: IntentRule[] = [
    // Export/import is an action verb: on a tie with anything else it wins.
    {
        intent: "ics-export",
        keywords: ["export", "ics", "xuat lich", "file lich", "cal file", "download lich", "import lich"],
    },
    {
        intent: "schedule",
        keywords: ["lich hoc", "thoi khoa bieu", "thời khóa biểu", "tkb", "timetable", "schedule", "lich len lop"],
    },
    {
        intent: "exams",
        keywords: ["lich thi", "thi cuoi ky", "thi giua ky", "exam", "exams", "loi thi", "thi lai"],
    },
    {
        intent: "lms",
        keywords: ["deadline", "han nop", "bai tap", "baitap", "assignment", "lms", "nop bai", "ket qua", "diem mon"],
    },
    {
        intent: "group-free-time",
        keywords: ["ranh", "free", "hop nhom", "gap nhom", "meeting", "gom lich", "lich ranh", "chung ranh"],
    },
    {
        intent: "group-tasks",
        keywords: ["cong viec", "task", "tasks", "phan cong", "viec can lam", "tien do"],
    },
];

/**
 * Classify a chat message into the most likely intent.
 * Falls back to "general" when nothing matches.
 */
export function classifyIntent(message: string): IntentResult {
    const folded = foldDiacritics(message);
    const scores: Partial<Record<ChatIntent, number>> = {};
    const matches: string[] = [];

    for (const rule of RULES) {
        let count = 0;
        for (const keyword of rule.keywords) {
            if (folded.includes(keyword)) {
                count += 1;
                matches.push(keyword);
            }
        }
        if (count > 0) {
            scores[rule.intent] = count;
        }
    }

    let best: ChatIntent = "general";
    let bestScore = 0;
    for (const [intent, count] of Object.entries(scores) as [ChatIntent, number][]) {
        if (count > bestScore) {
            best = intent;
            bestScore = count;
        }
    }

    return { intent: best, matches, scores };
}