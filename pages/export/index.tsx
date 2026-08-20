import { useEffect, useState } from "react";
import { AlertTriangle, CalendarSync, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import full_schedule from "@/utils/data/schedule";
import get_full_exam from "@/utils/data/exam";
import { parseScheduleToEvents } from "@/utils/calendar/parser";
import { buildIcs } from "@/utils/calendar/ics";
import type { LmsCourse, Task, Group } from "@/types";

export default function Export() {
    const [icsReady, setIcsReady] = useState(false);
    const [deadlineIcsReady, setDeadlineIcsReady] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [deadlineCount, setDeadlineCount] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function run() {
            try {
                const [schedule, exam] = await Promise.all([
                    full_schedule(),
                    get_full_exam(),
                ]);

                const events = parseScheduleToEvents(schedule, exam);
                const ics = buildIcs(events);
                const icsBlob = new Blob([ics], { type: "text/calendar;charset=utf-8;" });
                const icsLink = document.createElement("a");
                icsLink.href = URL.createObjectURL(icsBlob);
                icsLink.download = "schedule.ics";
                (window as any).__export_ics = icsLink;

                const user = JSON.parse(localStorage.getItem("user") ?? "{}");
                const accountId = (user?.username || user?.MSSV || user?.id || "").trim();
                if (accountId) {
                    const { buildDeadlinesIcs } = await import("../../lib/ics-builder");

                    const dashboardRes = await fetch(`/api/student/${encodeURIComponent(accountId)}`);
                    const dashboard = await dashboardRes.json();
                    const lmsCourses: LmsCourse[] =
                        dashboard?.ok && Array.isArray(dashboard.data?.lmsCourses)
                            ? dashboard.data.lmsCourses
                            : [];

                    const groupsRes = await fetch(
                        `/api/groups?username=${encodeURIComponent(accountId)}&withTasks=1`
                    );
                    const groupsJson = await groupsRes.json();
                    const groups: (Group & { tasks: Task[] })[] =
                        groupsJson?.ok && Array.isArray(groupsJson.data)
                            ? groupsJson.data
                            : [];

                    const items = [
                        ...lmsCourses.flatMap((course) =>
                            course.deadlines.map((d) => ({
                                uid: `deadline-${course.code}-${d.taskName}-${d.dueDate}`,
                                title: `${course.code} - ${d.taskName}`,
                                description: [
                                    course.name,
                                    d.weight != null
                                        ? `Trọng số: ${Math.round(d.weight * 100)}%`
                                        : "",
                                    d.priority ? `Ưu tiên: ${d.priority}` : "",
                                ]
                                    .filter(Boolean)
                                    .join(" · "),
                                dueDate: d.dueDate,
                                dueTime: d.dueTime ?? undefined,
                            }))
                        ),
                        ...groups.flatMap((group) =>
                            group.tasks
                                .filter((t) => t.deadline)
                                .map((task) => ({
                                    uid: `task-${group.id}-${task.id}`,
                                    title: `${group.name} - ${task.title}`,
                                    description: [
                                        task.description,
                                        task.assigneeEmail
                                            ? `Giao cho: ${task.assigneeEmail}`
                                            : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" · "),
                                    dueDate: task.deadline!.slice(0, 10),
                                    dueTime: task.deadline!.slice(11, 16) || undefined,
                                }))
                        ),
                    ];

                    const deadlineIcs = buildDeadlinesIcs(items);
                    const deadlineBlob = new Blob([deadlineIcs], {
                        type: "text/calendar;charset=utf-8;",
                    });
                    const deadlineLink = document.createElement("a");
                    deadlineLink.href = URL.createObjectURL(deadlineBlob);
                    deadlineLink.download = "deadlines.ics";
                    (window as any).__export_deadlines = deadlineLink;
                    setDeadlineCount(items.length);
                    setDeadlineIcsReady(true);
                }

                if (cancelled) return;
                setIcsReady(true);
            } catch (e: any) {
                if (cancelled) return;
                setNotice(e?.message ?? "Không tạo được file lịch");
            }
        }
        void run();

        return () => {
            cancelled = true;
        };
    }, []);

    const downloadIcs = () => {
        (window as any).__export_ics?.click();
    };
    const downloadDeadlines = () => {
        (window as any).__export_deadlines?.click();
    };

    return (
        <div className="h-full w-full flex flex-col justify-center items-center gap-4 overflow-y-auto p-4">
            <span className="text-3xl font-bold">Xuất lịch</span>
            <p className="text-sm text-muted-foreground text-center max-w-md">
                Tải thời khóa biểu, lịch thi và deadline dưới dạng tệp .ics chuẩn cho
                Google Calendar, Apple Calendar, Outlook, ...
            </p>

            {notice && (
                <div className="flex w-full max-w-lg items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {notice}
                </div>
            )}

            <div className="w-full max-w-lg flex flex-col gap-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Download className="h-4 w-4" /> Tải file lịch (.ics)
                        </CardTitle>
                        <CardDescription>
                            Lịch học và lịch thi của bạn dưới dạng tệp .ics — nhập vào
                            Google Calendar, Apple Calendar, Outlook, ...
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="outline" disabled={!icsReady} onClick={downloadIcs}>
                            <CalendarSync className="h-4 w-4 mr-2" />
                            Tải file lịch (.ics)
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Download className="h-4 w-4" /> Tải file deadline (.ics)
                        </CardTitle>
                        <CardDescription>
                            Deadline trên LMS và deadline công việc trong các nhóm của
                            bạn — nhắc trước 1 ngày.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="outline"
                            disabled={!deadlineIcsReady}
                            onClick={downloadDeadlines}
                        >
                            <CalendarSync className="h-4 w-4 mr-2" />
                            Tải file deadline (.ics)
                            {deadlineIcsReady && deadlineCount > 0 && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                    ({deadlineCount} hạn)
                                </span>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}