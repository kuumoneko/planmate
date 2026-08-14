export interface SubjectInfo {
    building: string;
    class: string;
    dates: string | string[]; // yyyy-mm-dd
    dayOfWeek: number;
    endTime: string;
    lesson: string;
    room: string;
    startTime: string;
    subject: string;
    teacher: string;
    weeks: number[];
}

export interface ExamInfo {
    subject: string,
    date: string,
    building: string,
    room: string,
    startTime: string,
    duration: string,
    class: string,
}

export interface CSVHeader {
    Subject: string,
    'Start Date': string, // DD/MM/YYY
    'Start Time'?: string,
    'End Date': string, // DD/MM/YYY
    'End Time'?: string,
    'All Day Event': "TRUE" | 'FALSE',
    Description: string,
    Location: string,
    Private: "TRUE" | "FALSE"
}

export interface DailySchedule {
    day: string;
    subjects: SubjectInfo[];
}
export interface WeeklySchedule {
    [date: string]: DailySchedule;
}
export interface FullScheduleByWeek {
    [week: string]: WeeklySchedule;
}

/* ------------------------- MVP domain models ------------------------- */

/** 1 = Monday ... 7 = Sunday (HCMUT mybk sends 2..8, normalized by the parser). */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Authenticated HCMUT student profile (mirrors localStorage "user" payload). */
export interface Student {
    username: string;
    mssv?: string;
    fullName?: string;
    email?: string;
    major?: string;
    faculty?: string;
    semester?: string;
}

/** Normalized weekly course from the mybk schedule (parser bridges SubjectInfo -> CourseSchedule). */
export interface CourseSchedule {
    courseCode: string;
    courseName: string;
    classGroup: string;
    teacher: string;
    room: string;
    building: string;
    dayOfWeek: DayOfWeek;
    startTime: string; // "HH:MM" 24h, Asia/Ho_Chi_Minh
    endTime: string;   // "HH:MM" 24h, Asia/Ho_Chi_Minh
    weeks: number[];   // ISO week numbers
    dates: string[];   // "yyyy-mm-dd" local dates the class actually meets
    lesson?: string;
}

/** Normalized exam (parser bridges ExamInfo -> ExamSchedule). */
export interface ExamSchedule {
    courseCode: string;
    courseName: string;
    classGroup: string;
    room: string;
    building: string;
    date: string;       // "yyyy-mm-dd"
    startTime: string;  // "HH:MM"
    durationMin: number;
}

export interface Reminder {
    method: "popup" | "email";
    minutesBefore: number;
}

/**
 * Neutral calendar payload consumed by BOTH the .ics builder and the
 * (flag-gated) Google Calendar sync service. No library-specific types leak in.
 */
export interface CalendarEventDraft {
    uid: string;                 // stable id -> idempotent imports / updates
    title: string;
    description: string;
    location: string;
    startLocal: string;          // "yyyy-MM-ddTHH:mm" (Asia/Ho_Chi_Minh)
    endLocal: string;            // "yyyy-MM-ddTHH:mm"
    allDay?: boolean;
    rrule?: string;              // "FREQ=WEEKLY;BYDAY=...;UNTIL=..."
    exdates: string[];           // "yyyy-MM-dd" occurrences to exclude
    reminders: Reminder[];
    attendees?: { name?: string; email: string }[];
    source?: { type: "course" | "exam" | "task" | "meeting"; id: string };
}

export interface GroupMember {
    studentId: string;           // MSSV
    email: string;               // @hcmut.edu.vn
    fullName: string;
    isLeader: boolean;
    joinedAt: string;            // ISO datetime
    scheduleShared: boolean;     // true when we have their cached schedule
    username?: string;           // app username when the member is a known user
}

export interface Group {
    id: string;
    name: string;
    courseCode: string;
    courseName: string;
    createdBy: string;           // username of leader
    members: GroupMember[];
    createdAt: string;
}

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
    id: string;
    groupId: string;
    title: string;
    description: string;
    assigneeEmail?: string;
    status: TaskStatus;
    deadline?: string;           // ISO datetime
    createdBy: string;
    createdAt: string;
}

/** A contiguous free interval on a given weekday. */
export interface FreeTimeSlot {
    dayOfWeek: DayOfWeek;
    start: string;               // "HH:MM"
    end: string;                 // "HH:MM"
    durationMin: number;
}

/** One member's parsed schedule, input to the common free-time algorithm. */
export interface StudentScheduleBundle {
    studentId: string;
    fullName: string;
    courses: CourseSchedule[];
}

export interface GoogleCredential {
    username: string;
    refreshToken: string;
    accessToken?: string;
    accessExpiry?: number;       // epoch ms
}

export interface SyncResult {
    created: number;
    updated: number;
    skipped: number;
    calendarId?: string;
}

/* ------------------------- MVP v2 (App Router) models ------------------------- */

export type Campus = "CS1" | "CS2";

export interface CampusConflict {
    dayOfWeek: DayOfWeek;
    campuses: Campus[];
    courses: {
        courseCode: string;
        courseName: string;
        room: string;
        startTime: string;
        endTime: string;
    }[];
}

export type SlotQuality = "PERFECT" | "TIGHT";

/** Free slot enriched with the group-meeting quality classification. */
export interface QualifiedFreeTimeSlot extends FreeTimeSlot {
    quality: SlotQuality;
}

/** Structured output produced by Gemini from parsed LMS markdown. */
export interface ParsedDeadline {
    taskName: string;
    dueDate: string; // ISO date (yyyy-mm-dd) — may be an estimate
    /** Deadline time ("HH:mm") when the source states one, else null. */
    dueTime?: string | null;
    weight: number | null; // percentage if stated (e.g. 0.1), else null
    courseName: string;
    /** Attachments declared on the assignment (name + Moodle file URL). */
    attachments?: { name: string; url: string }[];
}

export interface LmsCourse {
    id: string;
    code: string;
    name: string;
    url?: string;
    deadlines: ParsedDeadline[];
}

/** Full payload of the student dashboard endpoint. */
export interface StudentDashboardData {
    studentId: string;
    profile: {
        fullName: string;
        email: string;
        major?: string;
        faculty?: string;
        semester?: string;
    };
    timetable: CourseSchedule[]; // generated via lib/hcmut-week-parser
    exams: ExamSchedule[];
    lmsCourses: LmsCourse[];
    campusConflicts: CampusConflict[];
    lastSyncedAt?: string;
    source: "cache" | "live" | "none";
}