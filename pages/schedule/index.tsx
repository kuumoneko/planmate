import Logout from "@/utils/logout";
import full_schedule from "@/utils/data/schedule";
import { useEffect, useState } from "react";
import { getnow } from "@/utils/day";
import Loading from "@/components/Loading";
import { handle_error } from "@/utils/error";
import { FullScheduleByWeek, SubjectInfo } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ScheduleGrid, { GridDay } from "@/components/schedule/ScheduleGrid";
import ImportImageDialog from "@/components/import/ImportImageDialog";
import { Upload } from "lucide-react";

export default function Schedule() {
    const [schedule_all, setschedule] = useState<FullScheduleByWeek | null>(null);
    const this_week = getnow().week;
    const [week, setweek] = useState(0);
    const [importOpen, setImportOpen] = useState(false);
    const [username, setUsername] = useState("");

    useEffect(() => {
        setUsername(JSON.parse(localStorage.getItem("user") ?? "{}")?.username ?? "");
    }, []);

    useEffect(() => {
        async function run() {
            try {
                let schedule: SubjectInfo[];
                try {
                    schedule = await full_schedule();
                } catch (e: any) {
                    handle_error(e);
                    return;
                }

                function getFirstDayOfWeek(date = new Date()) {
                    const dayOfWeek = date.getDay();
                    const diff =
                        date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                    return new Date(date.setDate(diff));
                }

                const first_day_of_week = getFirstDayOfWeek();
                first_day_of_week.setHours(0, 0, 0, 0);

                const daysOfWeek = [
                    "Chủ Nhật",
                    "Thứ Hai",
                    "Thứ Ba",
                    "Thứ Tư",
                    "Thứ Năm",
                    "Thứ Sáu",
                    "Thứ Bảy",
                ];

                const getWeekNumber = (d: Date): number => {
                    d = new Date(
                        Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
                    );
                    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
                    const yearStart = new Date(
                        Date.UTC(d.getUTCFullYear(), 0, 1)
                    );
                    const weekNo = Math.ceil(
                        ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
                    );
                    return weekNo;
                };

                const datesByWeek = schedule
                    .sort((a: SubjectInfo, b: SubjectInfo) => {
                        const daysOrder = [
                            "Thứ Hai",
                            "Thứ Ba",
                            "Thứ Tư",
                            "Thứ Năm",
                            "Thứ Sáu",
                            "Thứ Bảy",
                            "Chủ Nhật",
                            "--",
                        ];

                        const dayA = Array.isArray(a.dates) ? a.dates[0] : a.dates;
                        const dayB = Array.isArray(b.dates) ? b.dates[0] : b.dates;

                        const indexA = daysOrder.indexOf(
                            dayA === "--"
                                ? "--"
                                : daysOfWeek[new Date(dayA).getDay()]
                        );
                        const indexB = daysOrder.indexOf(
                            dayB === "--"
                                ? "--"
                                : daysOfWeek[new Date(dayB).getDay()]
                        );

                        return indexA - indexB;
                    })
                    .reduce((acc: FullScheduleByWeek, subject: SubjectInfo) => {
                        if (subject?.dates === "--") {
                            subject?.weeks.forEach((week: number) => {
                                const weekKey = `Tuần ${week}`;

                                if (!acc[weekKey]) {
                                    return;
                                }

                                if (!acc[weekKey]["--"]) {
                                    acc[weekKey]["--"] = {
                                        day: "--",
                                        subjects: [],
                                    };
                                }
                                acc[weekKey]["--"].subjects.push(subject);
                            });
                        } else {
                            (subject?.dates as string[]).forEach(
                                (dateStr: string) => {
                                    const date = new Date(dateStr);
                                    if (date < first_day_of_week) return;

                                    const weekNumber = getWeekNumber(date);
                                    const weekKey = `Tuần ${weekNumber}`;
                                    const dayName = daysOfWeek[date.getDay()];

                                    if (!acc[weekKey]) acc[weekKey] = {};
                                    if (!acc[weekKey][dateStr]) {
                                        acc[weekKey][dateStr] = {
                                            day: dayName,
                                            subjects: [],
                                        };
                                    }

                                    acc[weekKey][dateStr].subjects.push(subject);
                                }
                            );
                        }

                        return acc;
                    }, {});

                setweek(this_week);
                setschedule(datesByWeek);
            } catch (e) {
                if (e === "ECONNRESET") {
                    Logout();
                    window.location.href = "/login";
                }
            }
        }
        run();
    }, []);

    const week_schedule = (schedule_all as FullScheduleByWeek)?.[`Tuần ${week}`] ?? {};

    // Build Monday -> Sunday grid from the week's date-keyed entries.
    const gridDays: GridDay[] = (() => {
        const byWeekday: GridDay[] = Array.from({ length: 7 }, () => ({ date: "", subjects: [] }));
        const unknown: SubjectInfo[] = [];

        for (const [dateStr, daily] of Object.entries(week_schedule)) {
            if (dateStr === "--" || daily.day === "--") {
                unknown.push(...daily.subjects);
                continue;
            }
            const weekday = new Date(dateStr).getDay(); // 0=Sun..6=Sat
            const slot = weekday === 0 ? 6 : weekday - 1; // Mon-first index
            byWeekday[slot] = {
                date: dateStr,
                subjects: daily.subjects.sort((a, b) =>
                    a.startTime.localeCompare(b.startTime)
                ),
            };
        }
        return byWeekday;
    })();

    const today = new Intl.DateTimeFormat("en-CA").format(new Date());
    const hasSchedule = schedule_all !== null && Object.keys(schedule_all).length > 0;
    const hasData = hasSchedule && Object.keys(week_schedule).length > 0;

    return (
        <div className="w-full h-full flex flex-col items-center gap-3 p-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 w-full max-w-5xl">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={week - 1 < this_week}
                        onClick={() => setweek(week - 1)}
                    >
                        Tuần trước
                    </Button>
                    <span className="font-semibold">Tuần {week}</span>
                    <Button variant="outline" size="sm" onClick={() => setweek(week + 1)}>
                        Tuần sau
                    </Button>
                    {week !== this_week && (
                        <Button variant="ghost" size="sm" onClick={() => setweek(this_week)}>
                            Tuần này
                        </Button>
                    )}
                </div>
                <Badge variant="secondary">{this_week === week ? "Tuần hiện tại" : ""}</Badge>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 w-full max-w-5xl">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setImportOpen(true)}
                >
                    <Upload className="size-4" />
                    Tải lên lịch học
                </Button>
                <span className="text-sm text-muted-foreground max-w-full truncate">
                    {username}
                </span>
            </div>

            {schedule_all === null ? (
                <Loading mode="Đang tải thời khóa biểu" />
            ) : !hasSchedule ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <p className="text-lg font-medium">Chưa có dữ liệu thời khoá biểu</p>
                    <p className="text-sm text-muted-foreground">
                        Chụp màn hình bảng thời khoá biểu từ mybk và tải lên
                        để tự động thêm lịch học.
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setImportOpen(true)}
                    >
                        <Upload className="size-4" />
                        Tải lên lịch học
                    </Button>
                </div>
            ) : (
                <div className="w-full max-w-5xl flex flex-col gap-3 overflow-y-auto pb-4">
                    <ScheduleGrid days={gridDays} today={today} />

                    {hasData === false && (
                        <p className="text-sm text-muted-foreground text-center">
                            Tuần này không có lịch học.
                        </p>
                    )}

                    {(() => {
                        const unknown = Object.entries(week_schedule)
                            .filter(([dateStr]) => dateStr === "--")
                            .flatMap(([, daily]) => daily.subjects);
                        if (unknown.length === 0) return null;
                        return (
                            <div className="flex flex-col gap-2">
                                <p className="text-sm text-muted-foreground">
                                    Có {unknown.length} môn chưa xác định được ngày:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {unknown.map((s, i) => (
                                        <Badge key={i} variant="outline">
                                            {s.subject} · {s.startTime}-{s.endTime}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
            <ImportImageDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                kind="schedule"
                username={username}
                onImported={() => window.location.reload()}
            />
        </div>
    );
}
