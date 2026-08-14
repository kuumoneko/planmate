"use client";
import { useMemo } from "react";
import { SubjectInfo } from "@/types";

/**
 * Interactive weekly timetable grid.
 * Columns: Mon..Sun · Rows: 06:00 -> 22:00 (school hours).
 * Classes are positioned proportionally to their real start/end time.
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
        <div className="flex flex-col w-full overflow-hidden rounded-xl border bg-card">
            {/* Day column headers */}
            <div className="flex border-b">
                <div className="w-14 shrink-0" />
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
                            {day.date ? day.date.slice(8) + "/" + day.date.slice(5, 7) : "--"}
                        </p>
                    </div>
                ))}
            </div>

            {/* Body */}
            <div className="flex overflow-x-auto">
                {/* Time axis */}
                <div
                    className="relative w-14 shrink-0 border-r"
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

                {/* Day columns */}
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
                            const color = SUBJECT_COLORS[hashName(subject.subject) % SUBJECT_COLORS.length];

                            return (
                                <div
                                    key={`${subject.subject}-${subject.startTime}-${index}`}
                                    className={`absolute left-1 right-1 rounded-md px-1.5 py-1 text-white shadow-sm transition-colors ${color}`}
                                    style={{ top, height }}
                                    title={`${subject.subject}\n${subject.teacher ?? ""}\n${subject.room ?? ""} · ${subject.building ?? ""}`}
                                >
                                    <p className="text-[11px] font-semibold leading-tight truncate">
                                        {subject.subject}
                                    </p>
                                    <p className="text-[9px] leading-tight opacity-90 truncate">
                                        {subject.startTime}-{subject.endTime}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}