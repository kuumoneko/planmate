"use client";
import { useMemo } from "react";
import { SubjectInfo } from "@/types";

/**
 * Interactive weekly timetable.
 * Desktop (md+): 7-column grid (Mon..Sun) · Rows: 06:00 -> 22:00, with the
 * time axis pinned while scrolling horizontally.
 * Mobile: stacked per-day cards (one block per class) — no horizontal scroll.
 */

const DAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];

const GRID_START_MIN = 6 * 60;   // 06:00
const GRID_END_MIN = 22 * 60;    // 22:00
const MINUTE_PX = 1;             // 1 minute = 1px

const HOUR_TICKS: string[] = [];
for (let h = 6; h <= 21; h++) {
    HOUR_TICKS.push(`${String(h).padStart(2, "0")}:00`);
}

const SUBJECT_COLORS = [
    "bg-blue-500/80 hover:bg-blue-500",
    "bg-emerald-500/80 hover:bg-emerald-500",
    "bg-violet-500/80 hover:bg-violet-500",
    "bg-rose-500/80 hover:bg-rose-500",
    "bg-amber-500/80 hover:bg-amber-500",
    "bg-cyan-500/80 hover:bg-cyan-500",
    "bg-lime-500/80 hover:bg-lime-500",
    "bg-fuchsia-500/80 hover:bg-fuchsia-500",
];

function hashName(name: string): number {
    let hash = 0;
    for (const char of name) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return hash;
}

function parseTime(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

function colorOf(name: string): string {
    return SUBJECT_COLORS[hashName(name) % SUBJECT_COLORS.length];
}

function dotColorOf(name: string): string {
    return colorOf(name).split(" ")[0].replace("/80", "");
}

function formatDayDate(date: string): string {
    return `${date.slice(8)}/${date.slice(5, 7)}`;
}

export interface GridDay {
    date: string;        // "yyyy-mm-dd"
    subjects: SubjectInfo[];
}

export default function ScheduleGrid({
    days,
    today,
}: {
    /** Ordered Monday -> Sunday. Missing days (empty) are still rendered. */
    days: GridDay[];
    /** Today's date "yyyy-mm-dd" for highlight ('' disables). */
    today: string;
}) {
    const cells = useMemo(() => {
        const list = DAY_LABELS.map((label, dayIndex) => ({
            label,
            date: days[dayIndex]?.date ?? "",
            subjects: days[dayIndex]?.subjects ?? [],
        }));
        return { list, gridHeight: (GRID_END_MIN - GRID_START_MIN) * MINUTE_PX };
    }, [days]);

    return (
        <>
            {/* ============ Desktop weekly grid (md+) ============ */}
            <div className="hidden md:flex flex-col w-full overflow-hidden rounded-xl border bg-card">
                <div className="flex overflow-x-auto">
                    {/* Time axis (pinned while scrolling horizontally) */}
                    <div
                        className="relative w-14 shrink-0 border-r bg-card sticky left-0 z-10"
                        style={{ height: cells.gridHeight }}
                    >
                        {HOUR_TICKS.map((tick) => (
                            <span
                                key={tick}
                                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground"
                                style={{ top: (parseTime(tick) - GRID_START_MIN) * MINUTE_PX }}
                            >
                                {tick}
                            </span>
                        ))}
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Day column headers */}
                        <div className="flex border-b bg-card">
                            {cells.list.map((day, dayIndex) => (
                                <div
                                    key={dayIndex}
                                    className={`flex-1 border-l py-2 text-center ${
                                        day.date && day.date === today
                                            ? "bg-primary/10 font-semibold"
                                            : ""
                                    }`}
                                >
                                    <p className="text-xs font-medium">{day.label}</p>
                                    <p className={`text-[10px] ${day.date ? "text-muted-foreground" : "opacity-0"}`}>
                                        {day.date ? formatDayDate(day.date) : "--"}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Day columns */}
                        <div className="flex">
                            {cells.list.map((day, dayIndex) => (
                                <div
                                    key={dayIndex}
                                    className={`relative flex-1 min-w-28 ${
                                        day.date === today ? "bg-primary/5" : ""
                                    }`}
                                    style={{ height: cells.gridHeight }}
                                >
                                    {/* hour gridlines */}
                                    {HOUR_TICKS.map((tick) => (
                                        <span
                                            key={tick}
                                            className="absolute left-0 right-0 border-t border-border/40"
                                            style={{ top: (parseTime(tick) - GRID_START_MIN) * MINUTE_PX }}
                                        />
                                    ))}

                                    {day.subjects.map((subject, index) => {
                                        const start = parseTime(subject.startTime);
                                        const end = parseTime(subject.endTime);
                                        const top = (start - GRID_START_MIN) * MINUTE_PX;
                                        const height = Math.max(24, (end - start) * MINUTE_PX);

                                        return (
                                            <div
                                                key={`${subject.subject}-${subject.startTime}-${index}`}
                                                className={`absolute left-1 right-1 rounded-md px-1.5 py-1 text-white shadow-sm transition-colors ${colorOf(subject.subject)}`}
                                                style={{ top, height }}
                                                title={`${subject.subject}\n${subject.teacher ?? ""}\n${subject.room ?? ""} · ${subject.building ?? ""}`}
                                            >
                                                <p className="text-xs font-semibold leading-tight truncate">
                                                    {subject.subject}
                                                </p>
                                                <p className="text-[10px] leading-tight opacity-90 truncate">
                                                    {subject.startTime}-{subject.endTime}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ============ Mobile per-day list (below md) ============ */}
            <div className="flex flex-col gap-3 md:hidden">
                {cells.list.map((day, dayIndex) => {
                    if (day.subjects.length === 0) return null;
                    const isToday = day.date && day.date === today;
                    return (
                        <div
                            key={dayIndex}
                            className={`rounded-xl border bg-card p-3 ${
                                isToday ? "ring-1 ring-primary" : ""
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold">
                                    {day.label}
                                    {isToday ? (
                                        <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                                            Hôm nay
                                        </span>
                                    ) : null}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {day.date ? formatDayDate(day.date) : "--"}
                                </p>
                            </div>
                            <div className="mt-2 flex flex-col gap-2">
                                {day.subjects.map((subject, index) => (
                                    <div
                                        key={`${subject.subject}-${subject.startTime}-${index}`}
                                        className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-2.5"
                                    >
                                        <span
                                            className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dotColorOf(subject.subject)}`}
                                        />
                                        <div className="w-14 shrink-0 text-xs font-medium leading-tight text-muted-foreground">
                                            {subject.startTime}
                                            <br />
                                            {subject.endTime}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium leading-tight">
                                                {subject.subject}
                                            </p>
                                            <p className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
                                                {subject.teacher
                                                    ? `${subject.teacher} · `
                                                    : ""}
                                                {subject.room ? subject.room : "Phòng TBD"}
                                                {subject.building ? ` (${subject.building})` : ""}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
