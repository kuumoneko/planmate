"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle,
    CalendarDays,
    ClipboardPaste,
    Clock,
    Download,
    Link2,
    ListChecks,
    Loader2,
    Plus,
    Trash2,
    Upload,
} from "lucide-react";
import type { ParsedDeadline, StudentDashboardData, Task } from "@/types";
import { useUser } from "@/hooks/useUser";
import { extractFileContent } from "@/lib/file-to-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CAMPUS_ADDRESSES, campusFromRoom } from "../../../lib/location-helper";

const DAY_NAMES = [
    "",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
    "Chủ Nhật",
];

const SOURCE_LABEL: Record<
    StudentDashboardData["source"],
    { text: string; variant: "default" | "secondary" | "outline" }
> = {
    cache: { text: "Dữ liệu đã lưu", variant: "secondary" },
    live: { text: "Dữ liệu thật", variant: "default" },
    none: { text: "Chưa có dữ liệu", variant: "outline" },
};

export default function DashboardClient({ studentId }: { studentId: string }) {
    const { user, loading: userLoading } = useUser();
    // The dashboard payload is keyed by the app username (Mongo `data` docs +
    // cache are username-keyed); the LMS login may use the MSSV instead.
    const accountId = (user?.username || studentId).trim();
    const [data, setData] = useState<StudentDashboardData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [pasteOpen, setPasteOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [removingKey, setRemovingKey] = useState<string | null>(null);
    const [myTasks, setMyTasks] = useState<
        | {
              task: Task;
              groupId: string;
              groupName: string;
              courseCode: string;
          }[]
        | null
    >(null);

    useEffect(() => {
        if (!data || !accountId) return;
        let cancelled = false;
        fetch(
            `/api/groups?username=${encodeURIComponent(accountId)}&withTasks=1`,
        )
            .then((r) => r.json())
            .then((json) => {
                if (!json.ok || cancelled) return;
                const email = (data.profile?.email ?? "").toLowerCase();
                const rows: {
                    task: Task;
                    groupId: string;
                    groupName: string;
                    courseCode: string;
                }[] = [];
                for (const g of (json.data ?? []) as {
                    id: string;
                    name: string;
                    courseCode: string;
                    tasks: Task[];
                }[]) {
                    for (const t of g.tasks ?? []) {
                        if (
                            t.assigneeEmail &&
                            t.assigneeEmail.toLowerCase() === email
                        ) {
                            rows.push({
                                task: t,
                                groupId: g.id,
                                groupName: g.name,
                                courseCode: g.courseCode,
                            });
                        }
                    }
                }
                rows.sort((a, b) =>
                    (a.task.deadline ?? "").localeCompare(
                        b.task.deadline ?? "",
                    ),
                );
                setMyTasks(rows);
            })
            .catch(() => {
                if (!cancelled) setMyTasks([]);
            });
        return () => {
            cancelled = true;
        };
    }, [data, accountId]);

    const toggleMyTask = async (groupId: string, task: Task) => {
        const nextStatus =
            task.status === "done"
                ? "todo"
                : task.status === "in_progress"
                  ? "done"
                  : "in_progress";
        try {
            // alert(user?.mssv + " " + task.id + " " + nextStatus);
            const res = await fetch(`/api/groups/${groupId}/tasks`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    studentId: user?.mssv,
                    taskId: task.id,
                    status: nextStatus,
                }),
            });
            const json = await res.json();
            if (!json.ok)
                throw new Error(json.data ?? "Không cập nhật được trạng thái");
            setMyTasks((prev) =>
                (prev ?? []).map((r) =>
                    r.task.id === task.id
                        ? { ...r, task: { ...r.task, ...json.data } }
                        : r,
                ),
            );
        } catch (e) {
            setNotice(
                e instanceof Error
                    ? e.message
                    : "Không cập nhật được trạng thái",
            );
        }
    };

    const load = useCallback(async () => {
        if (!accountId) return;
        setError(null);
        try {
            const dashboardRes = await fetch(`/api/student/${accountId}`);
            const dashboard = await dashboardRes.json();
            if (!dashboard.ok)
                throw new Error(dashboard.data ?? "Không tải được dữ liệu");
            setData(dashboard.data as StudentDashboardData);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Lỗi không xác định");
        }
    }, [accountId]);

    useEffect(() => {
        void load();
    }, [load]);

    const downloadIcs = async () => {
        try {
            const { buildCourseCalendarIcs } =
                await import("../../../lib/ics-builder");
            if (!data) return;
            const ics = buildCourseCalendarIcs(data.timetable);
            const blob = new Blob([ics], {
                type: "text/calendar;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `schedule-${accountId}.ics`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            setNotice(
                e instanceof Error ? e.message : "Không tạo được file .ics",
            );
        }
    };

    const removeDeadline = async (
        key: string,
        d: ParsedDeadline & { courseCode: string },
    ) => {
        if (!window.confirm(`Xóa deadline "${d.taskName}"?`)) return;
        setRemovingKey(key);
        try {
            const res = await fetch("/api/lms/remove", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    studentId: accountId,
                    courseCode: d.courseCode,
                    taskName: d.taskName,
                    dueDate: d.dueDate,
                }),
            });
            const json = await res.json();
            if (!json.ok) {
                setNotice(json.data ?? "Không xóa được deadline");
                return;
            }
            setNotice("Đã xóa deadline.");
            await load();
        } catch {
            setNotice("Không kết nối được máy chủ");
        } finally {
            setRemovingKey(null);
        }
    };

    if (userLoading) {
        return <div className="p-8 text-muted-foreground">Đang tải…</div>;
    }
    if (!accountId) {
        return (
            <div className="w-full h-full flex items-center justify-center p-8">
                <Card className="max-w-sm">
                    <CardHeader>
                        <CardTitle>Chưa đăng nhập</CardTitle>
                        <CardDescription>
                            Đăng nhập bằng tài khoản HCMUT để xem lịch học, lịch
                            thi và deadline của bạn.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            onClick={() => (window.location.href = "/login")}
                        >
                            Đăng nhập
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }
    if (error) {
        return (
            <div className="p-8 text-destructive">
                <p>{error}</p>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="p-8 text-muted-foreground">Đang tải dữ liệu…</div>
        );
    }

    const {
        profile,
        timetable,
        exams,
        lmsCourses,
        campusConflicts,
        lastSyncedAt,
        source,
    } = data;
    const deadlines = (lmsCourses ?? [])
        .flatMap((c) => c.deadlines.map((d) => ({ ...d, courseCode: c.code })))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const today = new Date().toISOString().slice(0, 10);

    return (
        <div className="w-full h-full overflow-y-auto p-4 flex flex-col gap-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">
                        {profile.fullName}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {profile.email} · {profile.major ?? "Chưa rõ ngành"}
                        {profile.faculty ? ` · ${profile.faculty}` : ""}
                        {profile.semester ? ` · ${profile.semester}` : ""}
                    </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <Badge variant={SOURCE_LABEL[source].variant}>
                        {SOURCE_LABEL[source].text}
                    </Badge>
                    {lastSyncedAt && (
                        <span className="text-xs text-muted-foreground">
                            Đồng bộ{" "}
                            {new Date(lastSyncedAt).toLocaleString("vi-VN")}
                        </span>
                    )}
                </div>
            </header>

            {campusConflicts.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl bg-destructive/10 p-4 text-sm ring-1 ring-destructive/30">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                    <div>
                        <p className="font-medium text-destructive">
                            Lịch học trải cả hai cơ sở — nguy cơ di chuyển xa
                        </p>
                        <ul className="mt-1 list-inside list-disc text-muted-foreground">
                            {campusConflicts.map((c) => (
                                <li key={c.dayOfWeek}>
                                    {DAY_NAMES[c.dayOfWeek]}:{" "}
                                    {c.courses
                                        .map(
                                            (x) =>
                                                `${x.courseCode} (${x.room})`,
                                        )
                                        .join(", ")}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {notice && (
                <div className="rounded-lg bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">
                    {notice}
                </div>
            )}

            <section className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex-row items-start justify-between space-y-0">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <CalendarDays className="size-4" /> Lịch học
                                tuần
                            </CardTitle>
                            <CardDescription>
                                {timetable.length} buổi học ·{" "}
                                {Array.from(
                                    new Set(timetable.map((c) => c.courseCode)),
                                ).join(", ")}
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={downloadIcs}
                            disabled={timetable.length === 0}
                        >
                            <Download /> Tải .ics
                        </Button>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {timetable.length === 0 && (
                            <p className="text-muted-foreground">
                                Chưa có môn học nào.
                            </p>
                        )}
                        {[...timetable]
                            .sort(
                                (a, b) =>
                                    a.dayOfWeek - b.dayOfWeek ||
                                    a.startTime.localeCompare(b.startTime),
                            )
                            .map((c, i) => (
                                <div
                                    key={`${c.courseCode}-${c.dayOfWeek}-${c.startTime}-${i}`}
                                    className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2"
                                >
                                    <div>
                                        <p className="font-medium">
                                            {c.courseName}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {DAY_NAMES[c.dayOfWeek]} ·{" "}
                                            {c.startTime}–{c.endTime} · {c.room}
                                        </p>
                                    </div>
                                    <Badge variant="secondary">
                                        {campusFromRoom(c.room) === "CS2"
                                            ? "CS2"
                                            : "CS1"}
                                    </Badge>
                                </div>
                            ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="size-4" /> Lịch thi
                        </CardTitle>
                        <CardDescription>
                            {exams.length} môn thi cuối kỳ
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {exams.length === 0 && (
                            <p className="text-muted-foreground">
                                Chưa có lịch thi.
                            </p>
                        )}
                        {[...exams]
                            .sort((a, b) => a.date.localeCompare(b.date))
                            .map((e, i) => (
                                <div
                                    key={`${e.courseCode}-${e.date}-${i}`}
                                    className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2"
                                >
                                    <div>
                                        <p className="font-medium">
                                            {e.courseName}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(
                                                e.date,
                                            ).toLocaleDateString("vi-VN")}{" "}
                                            · {e.startTime} (
                                            {Math.round(
                                                (e.durationMin / 60) * 10,
                                            ) / 10}
                                            h) · {e.room}
                                        </p>
                                    </div>
                                    <Badge
                                        variant={
                                            e.date < today
                                                ? "destructive"
                                                : "default"
                                        }
                                    >
                                        {e.date < today ? "Đã xong" : "Sắp tới"}
                                    </Badge>
                                </div>
                            ))}
                    </CardContent>
                </Card>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex-row items-start justify-between space-y-0">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Link2 className="size-4" /> Deadline từ LMS
                            </CardTitle>
                            <CardDescription>
                                {lmsCourses.length} môn học đã quét ·{" "}
                                {deadlines.length} deadline
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPasteOpen(true)}
                            >
                                <ClipboardPaste /> Dán nội dung
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAddOpen(true)}
                            >
                                <Plus /> Thêm thủ công
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setUploadOpen(true)}
                            >
                                <Upload /> Tải lên từ file
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {deadlines.length === 0 && (
                            <p className="text-muted-foreground">
                                Chưa có dữ liệu LMS. Tải lên file trang bài tập
                                từ LMS hoặc dán nội dung bài tập.
                            </p>
                        )}
                        <div className="no-scrollbar flex max-h-[min(26rem,75vh)] flex-col gap-2 overflow-y-auto overscroll-contain">
                            {deadlines.map((d, i) => {
                                const overdue = d.dueDate < today;
                                const soon = !overdue && d.dueDate <= today;
                                return (
                                    <div
                                        key={`${d.courseCode}-${d.taskName}-${i}`}
                                        className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2"
                                    >
                                        <div className="min-w-0">
                                            <p
                                                className="truncate font-medium"
                                                title={d.taskName}
                                            >
                                                {d.taskName}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {d.courseCode} · Hạn:{" "}
                                                {new Date(
                                                    d.dueDate,
                                                ).toLocaleDateString("vi-VN")}
                                                {d.dueTime
                                                    ? ` ${d.dueTime}`
                                                    : ""}
                                                {d.weight !== null
                                                    ? ` · ${Math.round(d.weight * 100)}%`
                                                    : ""}
                                            </p>
                                            {d.attachments &&
                                                d.attachments.length > 0 && (
                                                    <p className="mt-1 flex flex-wrap gap-2 text-xs text-primary">
                                                        {d.attachments.map(
                                                            (a) => (
                                                                <a
                                                                    key={
                                                                        a.url ||
                                                                        a.name
                                                                    }
                                                                    href={a.url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="underline underline-offset-2"
                                                                >
                                                                    {a.name}
                                                                </a>
                                                            ),
                                                        )}
                                                    </p>
                                                )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Badge
                                                variant={
                                                    overdue
                                                        ? "destructive"
                                                        : soon
                                                          ? "default"
                                                          : "secondary"
                                                }
                                            >
                                                {overdue
                                                    ? "Quá hạn"
                                                    : "Còn hạn"}
                                            </Badge>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                title="Xóa deadline này"
                                                aria-label="Xóa deadline này"
                                                disabled={removingKey !== null}
                                                onClick={() =>
                                                    void removeDeadline(
                                                        `${d.courseCode}-${d.taskName}-${i}`,
                                                        d,
                                                    )
                                                }
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ListChecks className="size-4" /> Công việc của tôi
                            {myTasks &&
                                myTasks.filter(
                                    (r) => r.task.status === "in_progress",
                                ).length > 0 && (
                                    <Badge variant="secondary">
                                        {
                                            myTasks.filter(
                                                (r) =>
                                                    r.task.status ===
                                                    "in_progress",
                                            ).length
                                        }{" "}
                                        đang làm
                                    </Badge>
                                )}
                        </CardTitle>
                        <CardDescription>Nhiệm vụ của bạn</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {myTasks === null ? (
                            <div className="flex flex-col gap-2">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : myTasks.length === 0 ? (
                            <p className="text-muted-foreground">
                                Chưa có công việc nào được giao cho bạn.
                            </p>
                        ) : (
                            <div className="no-scrollbar flex max-h-[min(26rem,75vh)] flex-col gap-2 overflow-y-auto overscroll-contain">
                                {myTasks.map(
                                    ({
                                        task,
                                        groupId,
                                        groupName,
                                        courseCode,
                                    }) => {
const overdue = Boolean(
                                            task.deadline &&
                                            task.status !== "done" &&
                                            task.deadline <
                                                new Date().toISOString(),
                                        );
                                        const checkboxClass =
                                            task.status === "done"
                                                ? "data-[state=checked]:border-green-500! data-[state=checked]:bg-green-500! data-[state=checked]:text-white!"
                                                : overdue
                                                  ? "data-[state=checked]:border-red-500! data-[state=checked]:bg-red-500! data-[state=checked]:text-white! data-[state=indeterminate]:border-red-500! data-[state=indeterminate]:bg-red-500! data-[state=indeterminate]:text-white!"
                                                  : task.status ===
                                                      "in_progress"
                                                    ? "data-[state=indeterminate]:border-amber-400! data-[state=indeterminate]:bg-amber-400! data-[state=indeterminate]:text-white!"
                                                    : "data-[state=unchecked]:border-blue-500!";
                                        return (
                                            <div
                                                key={task.id}
                                                className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2"
                                                title={groupName}
                                            >
                                                <Checkbox
                                                    className={checkboxClass}
                                                    checked={
                                                        task.status === "done"
                                                            ? true
                                                            : task.status ===
                                                                "in_progress"
                                                              ? "indeterminate"
                                                              : false
                                                    }
                                                    onCheckedChange={() =>
                                                        void toggleMyTask(
                                                            groupId,
                                                            task,
                                                        )
                                                    }
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p
                                                        className={`truncate font-medium ${
                                                            task.status ===
                                                            "done"
                                                                ? "line-through text-muted-foreground"
                                                                : ""
                                                        }`}
                                                    >
                                                        {task.title}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {courseCode && (
                                                            <Badge
                                                                variant="outline"
                                                                className="mr-1 text-[10px]"
                                                            >
                                                                {courseCode}
                                                            </Badge>
                                                        )}
                                                        {task.deadline
                                                            ? `Hạn: ${new Date(
                                                                  task.deadline,
                                                              ).toLocaleDateString(
                                                                  "vi-VN",
                                                              )}`
                                                            : "Không có hạn"}
                                                    </p>
                                                </div>
                                                {overdue && (
                                                    <Badge variant="destructive">
                                                        Quá hạn
                                                    </Badge>
                                                )}
                                                {task.status ===
                                                    "in_progress" && (
                                                    <Badge variant="secondary">
                                                        Đang làm
                                                    </Badge>
                                                )}
                                                {task.status === "todo" && (
                                                    <Badge variant="secondary">
                                                        Nhiệm vụ
                                                    </Badge>
                                                )}
                                            </div>
                                        );
                                    },
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>

            <footer className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                {source === "none" && (
                    <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4 text-sm ring-1 ring-border">
                        <div>
                            <p className="font-medium">
                                Chưa có dữ liệu lịch học, lịch thi và deadline
                            </p>
                            <p className="mt-1 text-muted-foreground">
                                Đăng nhập trên trang Lịch học để tự động tải
                                thời khoá biểu và lịch thi. Deadline từ LMS có
                                thể được tải lên hoặc dán từ trang bài tập.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                onClick={() => setUploadOpen(true)}
                            >
                                <Upload /> Tải lên từ file
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPasteOpen(true)}
                            >
                                <ClipboardPaste /> Dán nội dung
                            </Button>
                        </div>
                    </div>
                )}

                {campusConflicts.length > 0 && (
                    <span className="max-w-xl text-center">
                        Ghi chú: {CAMPUS_ADDRESSES.CS1.split(",")[0]} ·{" "}
                        {CAMPUS_ADDRESSES.CS2.split(",")[0]} cách nhau ~15 km.
                    </span>
                )}
            </footer>

            <LmsUploadDialog
                open={uploadOpen}
                onOpenChange={setUploadOpen}
                studentId={accountId}
                onUploaded={(summary) => {
                    setNotice(summary);
                    void load();
                }}
            />
            <LmsPasteDialog
                open={pasteOpen}
                onOpenChange={setPasteOpen}
                studentId={accountId}
                onPasted={(summary) => {
                    setNotice(summary);
                    void load();
                }}
            />
            <LmsAddDialog
                open={addOpen}
                onOpenChange={setAddOpen}
                studentId={accountId}
                onAdded={(summary) => {
                    setNotice(summary);
                    void load();
                }}
            />
        </div>
    );
}

function LmsUploadDialog({
    open,
    onOpenChange,
    studentId,
    onUploaded,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    studentId: string;
    onUploaded: (summary: string) => void;
}) {
    const [fileName, setFileName] = useState<string | null>(null);
    const [stage, setStage] = useState<"extracting" | "parsing" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const busy = stage !== null;

    const submit = async (file: File | null) => {
        if (!file) return;
        setError(null);
        try {
            setStage("extracting");
            const extracted = await extractFileContent(file);
            const body =
                extracted.kind === "image"
                    ? {
                          image: extracted.base64,
                          mimeType: extracted.mimeType,
                          studentId,
                      }
                    : { text: extracted.text, studentId };
            setStage("parsing");
            const res = await fetch("/api/lms/parse", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.ok) {
                setError(json.data ?? "Không phân tích được nội dung");
                return;
            }
            onUploaded(
                `Đã thêm ${json.data.deadlineCount} deadline từ ${json.data.courseCount} môn học.`,
            );
            onOpenChange(false);
            setFileName(null);
        } catch (e: any) {
            setError(e?.message ?? "Không đọc được file");
        } finally {
            setStage(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Tải lên file từ LMS</DialogTitle>
                    <DialogDescription>
                        Lưu trang bài tập (to-do list) từ LMS thành file .html,
                        .txt, .docx, .pptx hoặc .pdf (chụp màn hình .jpg/.png
                        cũng được) rồi tải lên đây để rút deadline. Nội dung
                        được xử lý trên máy chủ, không lưu lại file.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="lms-file">File bài tập LMS</Label>
                    <Input
                        id="lms-file"
                        type="file"
                        accept=".html,.htm,.txt,.docx,.pptx,.pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            setFileName(file?.name ?? null);
                            void submit(file);
                        }}
                    />
                    {fileName && (
                        <p className="text-sm text-muted-foreground">
                            Đã chọn: {fileName}
                        </p>
                    )}
                    {busy && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            {stage === "extracting"
                                ? "Đang đọc nội dung file…"
                                : "Đang phân tích bằng Gemini (có thể mất 1–2 phút)…"}
                        </p>
                    )}
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Hỗ trợ tối đa 10MB. File .doc/.ppt cũ hãy lưu lại thành
                        .docx/.pptx trước khi tải lên.
                    </p>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={busy}
                    >
                        Đóng
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function LmsPasteDialog({
    open,
    onOpenChange,
    studentId,
    onPasted,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    studentId: string;
    onPasted: (summary: string) => void;
}) {
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!text.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/lms/parse", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ text, studentId }),
            });
            const json = await res.json();
            if (!json.ok) {
                setError(json.data ?? "Không phân tích được nội dung");
                return;
            }
            onPasted(
                `Đã thêm ${json.data.deadlineCount} deadline từ ${json.data.courseCount} môn học.`,
            );
            onOpenChange(false);
            setText("");
        } catch {
            setError("Không kết nối được máy chủ");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Dán nội dung từ LMS</DialogTitle>
                    <DialogDescription>
                        Sao chép nội dung các bài tập (tên, hạn nộp, tỷ lệ điểm)
                        từ trang LMS rồi dán vào đây để rút deadline.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="lms-paste">Nội dung LMS</Label>
                    <textarea
                        id="lms-paste"
                        className="h-40 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={
                            "CO3001 - Phân tích thiết kế hướng đối tượng\n- Bài tập 1 - hạn nộp: 15/04/2026 (10%)\n- Bài tập 2 - nộp ngày 30/05/2026 (0.2)"
                        }
                    />
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={busy}
                    >
                        Huỷ
                    </Button>
                    <Button
                        onClick={() => void submit()}
                        disabled={busy || !text.trim()}
                    >
                        {busy ? "Đang phân tích…" : "Thêm deadline"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function LmsAddDialog({
    open,
    onOpenChange,
    studentId,
    onAdded,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    studentId: string;
    onAdded: (summary: string) => void;
}) {
    const [courseName, setCourseName] = useState("");
    const [taskName, setTaskName] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [dueTime, setDueTime] = useState("");
    const [weight, setWeight] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit =
        !busy && courseName.trim() && taskName.trim() && dueDate.trim();

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/lms/add", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    studentId,
                    courseName: courseName.trim(),
                    taskName: taskName.trim(),
                    dueDate: dueDate.trim(),
                    dueTime: dueTime.trim() || undefined,
                    weight: weight.trim() === "" ? null : Number(weight),
                }),
            });
            const json = await res.json();
            if (!json.ok) {
                setError(json.data ?? "Không thêm được deadline");
                return;
            }
            onAdded("Đã thêm deadline.");
            onOpenChange(false);
            setCourseName("");
            setTaskName("");
            setDueDate("");
            setDueTime("");
            setWeight("");
        } catch {
            setError("Không kết nối được máy chủ");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Thêm deadline thủ công</DialogTitle>
                    <DialogDescription>
                        Nhập bài tập có hạn nộp để thêm vào danh sách deadline.
                        Trùng tên bài tập trong cùng môn sẽ được cập nhật lại.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="lms-add-course">
                        Môn học (mã môn nếu có)
                    </Label>
                    <Input
                        id="lms-add-course"
                        value={courseName}
                        onChange={(e) => setCourseName(e.target.value)}
                        placeholder="CO3001 - Phân tích thiết kế hướng đối tượng"
                    />
                    <Label htmlFor="lms-add-task">Tên bài tập</Label>
                    <Input
                        id="lms-add-task"
                        value={taskName}
                        onChange={(e) => setTaskName(e.target.value)}
                        placeholder="Bài tập 1"
                    />
                    <div className="flex gap-2">
                        <div className="flex flex-1 flex-col gap-2">
                            <Label htmlFor="lms-add-date">Ngày hạn</Label>
                            <Input
                                id="lms-add-date"
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-1 flex-col gap-2">
                            <Label htmlFor="lms-add-time">Giờ (tuỳ chọn)</Label>
                            <Input
                                id="lms-add-time"
                                type="time"
                                value={dueTime}
                                onChange={(e) => setDueTime(e.target.value)}
                            />
                        </div>
                    </div>
                    <Label htmlFor="lms-add-weight">
                        Tỷ lệ điểm % (tuỳ chọn)
                    </Label>
                    <Input
                        id="lms-add-weight"
                        type="number"
                        min={0}
                        max={100}
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        placeholder="10"
                    />
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={busy}
                    >
                        Huỷ
                    </Button>
                    <Button onClick={() => void submit()} disabled={!canSubmit}>
                        {busy ? "Đang thêm…" : "Thêm deadline"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
