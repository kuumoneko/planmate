/**
 * Demo seeder — creates the 4 demo accounts used in the video walkthrough.
 * Idempotent: re-running upserts and rebuilds data.
 *
 * Usage: bun run seed:demo
 *
 * Accounts (password for all: Demo@1234):
 *   nhat.mai   SSO-style, MSSV 2310001, "Mai Ngọc Nhật"  (rich data: exam, LMS)
 *   alex_dev   local,     "Alex Nguyễn"
 *   linh_tran  local,     "Trần Thu Linh"
 *   minh.phan  SSO-style, MSSV 2310002, "Phan Quốc Minh"
 *
 * The group is intentionally NOT seeded — the video captures the group
 * creation flow. Wednesday layouts leave the common free window
 * 14:00–16:30 so the group "Tìm lịch trống" feature has an obvious slot.
 */
import { getMongoClient } from "@/lib/mongodb";
import { hash } from "@/lib/auth/hash";
import { convert } from "@/lib/pass";
import { deleteCache } from "@/lib/cache";
import type { SubjectInfo, ExamInfo, LmsCourse, ParsedDeadline } from "@/types";

const DB = "hcmut";
const PASSWORD = "Demo@1234";
const WEEKS = 8;

/* ------------------------------- date utils ------------------------------- */

function isoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
}

function isoWeek(d: Date): number {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Monday 00:00 of the current week (same cutoff as currentWeekMonday()). */
function currentWeekMonday(): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function addDaysIso(base: Date, days: number): string {
    return isoDate(addDays(base, days));
}

/* ----------------------------- schedule builder --------------------------- */

interface CourseSeed {
    subject: string;
    teacher: string;
    class: string;
    dayOfWeek: number; // HCMUT mybk numbering: 2 = Monday ... 8 = Sunday
    startTime: string;
    endTime: string;
    building: string;
    room: string;
    lesson?: string;
}

function buildSchedule(seeds: CourseSeed[], monday: Date, weeks = WEEKS): SubjectInfo[] {
    return seeds.map((seed) => {
        const dates: string[] = [];
        const weekNumbers: number[] = [];
        for (let w = 0; w < weeks; w++) {
            const date = addDays(monday, w * 7 + (seed.dayOfWeek - 2));
            dates.push(isoDate(date));
            weekNumbers.push(isoWeek(date));
        }
        return {
            building: seed.building,
            class: seed.class,
            dates,
            dayOfWeek: seed.dayOfWeek,
            endTime: seed.endTime,
            lesson: seed.lesson ?? "LT",
            room: seed.room,
            startTime: seed.startTime,
            subject: seed.subject,
            teacher: seed.teacher,
            weeks: weekNumbers,
        };
    });
}

function overlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return aStart < bEnd && bStart < aEnd;
}

/**
 * Make "today" look busy: add the 3 canonical demo classes on today's weekday
 * (Giải tích 2 / Kỹ thuật Lập trình / Vật lý 1) unless a class already
 * occupies the slot. Today being Wednesday is already covered by the fixed
 * weekly layout, so nothing is added.
 */
function withTodayOverlay(schedule: SubjectInfo[], monday: Date): SubjectInfo[] {
    const today = new Date();
    const todayDow = today.getDay() === 0 ? 8 : today.getDay() + 1; // 2..8
    if (todayDow === 4) return schedule; // Wed layout already has the trio

    const existing = schedule.filter((s) => s.dayOfWeek === todayDow);
    const candidates: { subject: string; startTime: string; endTime: string; room: string; building: string }[] = [
        { subject: "Giải tích 2", startTime: "08:00", endTime: "10:50", room: "H6-302", building: "H6" },
        { subject: "Kỹ thuật Lập trình", startTime: "11:30", endTime: "13:20", room: "A4-201", building: "A4" },
        { subject: "Vật lý 1", startTime: "14:00", endTime: "16:50", room: "H1-505", building: "H1" },
    ];

    const added: SubjectInfo[] = [];
    for (const c of candidates) {
        const clash = existing.some((s) => overlap(s.startTime, s.endTime, c.startTime, c.endTime));
        if (clash) continue;
        const sameCourse = existing.find((s) => s.subject === c.subject);
        const base = sameCourse ?? {
            subject: c.subject,
            teacher: "TS. Trần Đình Khang",
            class: "LT20261",
            lesson: "LT",
        };
        added.push({
            ...base,
            building: c.building,
            room: c.room,
            startTime: c.startTime,
            endTime: c.endTime,
            dayOfWeek: todayDow,
            dates: [isoDate(today)],
            weeks: [isoWeek(today)],
        });
    }
    return [...schedule, ...added];
}

/* --------------------------------- seeds ---------------------------------- */

function nhatMaiSchedule(monday: Date): SubjectInfo[] {
    const weekly = buildSchedule(
        [
            { subject: "Đại số Tuyến tính", teacher: "ThS. Nguyễn Thị Hồng Vân", class: "ĐSTT20261-N1", dayOfWeek: 2, startTime: "07:00", endTime: "09:50", building: "H1", room: "H1-201" },
            { subject: "Hệ điều hành", teacher: "TS. Lê Minh Châu", class: "HDH20261-N2", dayOfWeek: 2, startTime: "13:00", endTime: "15:50", building: "B2", room: "B2-301" },
            { subject: "Giải tích 2", teacher: "TS. Trần Đình Khang", class: "GT2-20261-N4", dayOfWeek: 3, startTime: "08:00", endTime: "10:50", building: "H6", room: "H6-302" },
            { subject: "Cấu trúc Dữ liệu", teacher: "TS. Phạm Anh Tuấn", class: "CTDL20261-N2", dayOfWeek: 3, startTime: "12:30", endTime: "15:20", building: "A4", room: "A4-201" },
            { subject: "Giải tích 2", teacher: "TS. Trần Đình Khang", class: "GT2-20261-N4", dayOfWeek: 4, startTime: "08:00", endTime: "10:50", building: "H6", room: "H6-302" },
            { subject: "Kỹ thuật Lập trình", teacher: "TS. Vũ Thị Ngọc Ánh", class: "KTLT20261-N5", dayOfWeek: 4, startTime: "11:30", endTime: "13:20", building: "A4", room: "A4-201" },
            { subject: "Vật lý 1", teacher: "PGS.TS. Đinh Văn Hùng", class: "VL1-20261-N3", dayOfWeek: 4, startTime: "16:30", endTime: "18:20", building: "H1", room: "H1-505" },
            { subject: "Vật lý 1", teacher: "PGS.TS. Đinh Văn Hùng", class: "VL1-20261-N3", dayOfWeek: 5, startTime: "07:00", endTime: "09:50", building: "H1", room: "H1-505" },
            { subject: "Kỹ thuật Số", teacher: "TS. Trần Đình Khang", class: "KTS20261-N1", dayOfWeek: 5, startTime: "13:30", endTime: "16:20", building: "B2", room: "B2-204" },
            { subject: "Đại số Tuyến tính", teacher: "ThS. Nguyễn Thị Hồng Vân", class: "ĐSTT20261-N1", dayOfWeek: 6, startTime: "10:10", endTime: "12:00", building: "H1", room: "H1-201" },
            { subject: "Kỹ thuật Lập trình", teacher: "TS. Vũ Thị Ngọc Ánh", class: "KTLT20261-N5", dayOfWeek: 6, startTime: "14:00", endTime: "16:50", building: "A4", room: "A4-201" },
        ],
        monday
    );
    return withTodayOverlay(weekly, monday);
}

function alexDevSchedule(monday: Date): SubjectInfo[] {
    return buildSchedule(
        [
            { subject: "Cấu trúc Dữ liệu", teacher: "TS. Phạm Anh Tuấn", class: "CTDL20261-N2", dayOfWeek: 2, startTime: "07:00", endTime: "09:50", building: "A4", room: "A4-201" },
            { subject: "Pháp luật Đại cương", teacher: "ThS. Lê Thị Thu Hà", class: "PLDC20261-N1", dayOfWeek: 2, startTime: "13:00", endTime: "14:50", building: "H2", room: "H2-101" },
            { subject: "Cấu trúc Dữ liệu", teacher: "TS. Phạm Anh Tuấn", class: "CTDL20261-N2", dayOfWeek: 4, startTime: "08:00", endTime: "12:00", building: "A4", room: "A4-201" },
            { subject: "Mạng máy tính", teacher: "TS. Nguyễn Quốc Khánh", class: "MMT20261-N2", dayOfWeek: 4, startTime: "16:30", endTime: "19:00", building: "B2", room: "B2-301" },
            { subject: "Mạng máy tính", teacher: "TS. Nguyễn Quốc Khánh", class: "MMT20261-N2", dayOfWeek: 5, startTime: "13:30", endTime: "16:20", building: "B2", room: "B2-301" },
            { subject: "Pháp luật Đại cương", teacher: "ThS. Lê Thị Thu Hà", class: "PLDC20261-N1", dayOfWeek: 6, startTime: "08:00", endTime: "10:50", building: "H2", room: "H2-101" },
        ],
        monday
    );
}

function linhTranSchedule(monday: Date): SubjectInfo[] {
    return buildSchedule(
        [
            { subject: "Thiết kế CSDL", teacher: "TS. Hoàng Thị Bích Ngọc", class: "TKCSDL20261-N1", dayOfWeek: 3, startTime: "07:00", endTime: "09:50", building: "H3", room: "H3-102" },
            { subject: "Phân tích TK HĐT", teacher: "TS. Nguyễn Việt Anh", class: "PTTKHDT20261-N1", dayOfWeek: 3, startTime: "13:30", endTime: "16:20", building: "H3", room: "H3-201" },
            { subject: "Thiết kế CSDL", teacher: "TS. Hoàng Thị Bích Ngọc", class: "TKCSDL20261-N1", dayOfWeek: 4, startTime: "10:00", endTime: "14:00", building: "H3", room: "H3-102" },
            { subject: "Phân tích TK HĐT", teacher: "TS. Nguyễn Việt Anh", class: "PTTKHDT20261-N1", dayOfWeek: 4, startTime: "16:30", endTime: "19:00", building: "H3", room: "H3-201" },
            { subject: "Thiết kế CSDL", teacher: "TS. Hoàng Thị Bích Ngọc", class: "TKCSDL20261-N1", dayOfWeek: 6, startTime: "10:10", endTime: "12:00", building: "H3", room: "H3-102" },
        ],
        monday
    );
}

function minhPhanSchedule(monday: Date): SubjectInfo[] {
    return buildSchedule(
        [
            { subject: "Hệ điều hành", teacher: "TS. Lê Minh Châu", class: "HDH20261-N2", dayOfWeek: 2, startTime: "07:00", endTime: "09:50", building: "B2", room: "B2-201" },
            { subject: "Toán rời rạc", teacher: "TS. Nguyễn Thị Hồng Vân", class: "TRR20261-N1", dayOfWeek: 2, startTime: "13:30", endTime: "16:20", building: "H1", room: "H1-302" },
            { subject: "Hệ điều hành", teacher: "TS. Lê Minh Châu", class: "HDH20261-N2", dayOfWeek: 4, startTime: "07:30", endTime: "11:00", building: "B2", room: "B2-201" },
            { subject: "Toán rời rạc", teacher: "TS. Nguyễn Thị Hồng Vân", class: "TRR20261-N1", dayOfWeek: 4, startTime: "16:30", endTime: "18:00", building: "H1", room: "H1-302" },
            { subject: "Hệ điều hành", teacher: "TS. Lê Minh Châu", class: "HDH20261-N2", dayOfWeek: 5, startTime: "13:30", endTime: "15:20", building: "B2", room: "B2-201" },
        ],
        monday
    );
}

function nhatMaiExam(monday: Date): ExamInfo[] {
    return [
        { subject: "Đại số Tuyến tính", date: addDaysIso(monday, 5), building: "H1", room: "H1-201", startTime: "07:00", duration: "90 phút", class: "ĐSTT20261-N1" },
        { subject: "Vật lý 1", date: addDaysIso(monday, 11), building: "H2", room: "H2-204", startTime: "13:30", duration: "120 phút", class: "VL1-20261-N3" },
    ];
}

function nhatMaiLms(monday: Date): LmsCourse[] {
    const deadline = (
        taskName: string,
        days: number,
        weight: number,
        priority: "High" | "Medium" | "Low"
    ): ParsedDeadline => ({
        taskName,
        dueDate: addDaysIso(monday, days),
        dueTime: "23:59",
        weight,
        courseName: "",
        priority,
        context: taskName,
    });

    return [
        {
            id: "ee2011",
            code: "EE2011 - Mạch Điện 1",
            name: "Mạch Điện 1",
            url: "https://lms.hcmut.edu.vn/course/view.php?id=ee2011",
            deadlines: [
                deadline("BTL Mạch Điện 1 - Báo cáo tuần 4", 2, 0.2, "High"),
                deadline("Bài tập chương 3", 7, 0.05, "Medium"),
            ],
        },
        {
            id: "co2011",
            code: "CO2011 - Kỹ thuật Lập trình",
            name: "Kỹ thuật Lập trình",
            url: "https://lms.hcmut.edu.vn/course/view.php?id=co2011",
            deadlines: [deadline("Lab 5 - Con trỏ & Mảng động", 5, 0.1, "High")],
        },
        {
            id: "mt1009",
            code: "MT1009 - Giải tích 2",
            name: "Giải tích 2",
            url: "https://lms.hcmut.edu.vn/course/view.php?id=mt1009",
            deadlines: [deadline("Bài tập chương 6 (Chuỗi)", 4, 0.05, "Medium")],
        },
    ];
}

/* ---------------------------------- main ---------------------------------- */

interface DemoAccount {
    username: string;
    user: Record<string, unknown>;
    schedule: SubjectInfo[];
    exam?: ExamInfo[];
    lms?: LmsCourse[];
}

async function main(): Promise<void> {
    const monday = currentWeekMonday();
    const client = await getMongoClient();
    const db = client.db(DB);

    const accounts: DemoAccount[] = [
        {
            username: "nhat.mai",
            user: {
                id: "2310001",
                name: "Mai Ngọc Nhật",
                MSSV: "2310001",
                class: "KTPM2026.1",
                major: "Kỹ thuật Máy tính",
                teachingDep: "Khoa Khoa học & Kỹ thuật Máy tính",
                trainingType: "Chính quy",
                trainingLevel: "Đại học",
                trainingForms: "Tập trung",
                semesterStart: "12/08/2026",
                email: "nhat.mai@hcmut.edu.vn",
                semester: "20261",
            },
            schedule: nhatMaiSchedule(monday),
            exam: nhatMaiExam(monday),
            lms: nhatMaiLms(monday),
        },
        {
            username: "alex_dev",
            user: { name: "Alex Nguyễn" },
            schedule: alexDevSchedule(monday),
        },
        {
            username: "linh_tran",
            user: { name: "Trần Thu Linh" },
            schedule: linhTranSchedule(monday),
        },
        {
            username: "minh.phan",
            user: {
                id: "2310002",
                name: "Phan Quốc Minh",
                MSSV: "2310002",
                class: "KTPM2026.1",
                major: "Kỹ thuật Máy tính",
                teachingDep: "Khoa Khoa học & Kỹ thuật Máy tính",
                trainingType: "Chính quy",
                trainingLevel: "Đại học",
                trainingForms: "Tập trung",
                semesterStart: "12/08/2026",
                email: "minh.phan@hcmut.edu.vn",
                semester: "20261",
            },
            schedule: minhPhanSchedule(monday),
        },
    ];

    const password = convert(await hash(PASSWORD));
    const col = db.collection("data");

    for (const acc of accounts) {
        const patch: Record<string, unknown> = {
            username: acc.username,
            user: acc.user,
            schedule: acc.schedule,
            exam: acc.exam ?? null,
            lms: acc.lms ?? [],
        };
        const existing = await col.findOne({ username: acc.username });
        if (existing) {
            patch.password = existing.password ?? password;
        } else {
            patch.password = password;
        }
        await col.updateOne(
            { username: acc.username },
            { $set: patch, $currentDate: { updatedAt: true } },
            { upsert: true }
        );

        await deleteCache(`dashboard:${acc.username}`);
        const mssv = String(acc.user.MSSV ?? "");
        if (mssv) await deleteCache(`dashboard:${mssv}`);
    }

    const wed = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"][4 - 2];
    console.log("Seeded demo accounts (password: Demo@1234):");
    for (const acc of accounts) {
        const count = acc.schedule.filter((s) => s.dayOfWeek === 4).length;
        console.log(`  - ${acc.username.padEnd(10)} ${String(acc.user.name).padEnd(16)} ${acc.schedule.length} courses, ${count} on ${wed}`);
    }
    console.log(`  - common free window on ${wed}: 14:00 - 16:30`);
    console.log("Video: signup a NEW local account, create the group manually, then add these 4 as members.");
    await client.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});