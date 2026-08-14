import { useEffect, useState } from "react";
import { CalendarSync, Check, Copy, Download, FileSpreadsheet, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import full_schedule from "@/utils/data/schedule";
import get_full_exam from "@/utils/data/exam";
import export_csv from "@/utils/data/export";
import { parseScheduleToEvents } from "@/utils/calendar/parser";
import { buildIcs } from "@/utils/calendar/ics";
import { GOOGLE_CALENDAR_ENABLED } from "@/lib/calendar/config";

function useCopy(): [boolean, (text: string) => void] {
    const [copied, setCopied] = useState(false);
    const copy = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return [copied, copy];
}

export default function Export() {
    const [csvReady, setCsvReady] = useState(false);
    const [icsReady, setIcsReady] = useState(false);
    const [webcalUrl, setWebcalUrl] = useState<string>("");
    const [copied, copy] = useCopy();

    useEffect(() => {
        async function run() {
            const [schedule, exam] = await Promise.all([
                full_schedule(),
                get_full_exam(),
            ]);

            // 1) CSV (legacy path, unchanged behavior)
            const csv = export_csv([...schedule, ...exam]);
            const csvString = [
                Object.keys(csv[0]).join(","),
                ...csv.map((row: any) => Object.values(row).join(",")),
            ].join("\n");

            // 2) ICS from the same parsed data
            const events = parseScheduleToEvents(schedule, exam);
            const ics = buildIcs(events);

            // 3) Webcal subscription URL
            const user = JSON.parse(localStorage.getItem("user") ?? "{}");
            const studentId = user?.MSSV ?? user?.id;
            if (studentId) {
                setWebcalUrl(`${location.origin}/api/calendar/${studentId}.ics`);
            }

            const csvBlob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
            const icsBlob = new Blob([ics], { type: "text/calendar;charset=utf-8;" });

            const csvLink = document.createElement("a");
            csvLink.href = URL.createObjectURL(csvBlob);
            csvLink.download = "schedule.csv";

            const icsLink = document.createElement("a");
            icsLink.href = URL.createObjectURL(icsBlob);
            icsLink.download = "schedule.ics";

            (window as any).__export_csv = csvLink;
            (window as any).__export_ics = icsLink;
            setCsvReady(true);
            setIcsReady(true);
        }
        run();
    }, []);

    const downloadCsv = () => {
        (window as any).__export_csv?.click();
    };
    const downloadIcs = () => {
        (window as any).__export_ics?.click();
    };

    return (
        <div className="h-full w-full flex flex-col justify-center items-center gap-4 overflow-y-auto p-4">
            <span className="text-3xl font-bold">Xuất lịch</span>
            <p className="text-sm text-muted-foreground text-center max-w-md">
                Tải thời khóa biểu và lịch thi dưới dạng CSV (Google Calendar import) hoặc
                tệp .ics chuẩn. Bạn cũng có thể đăng ký Webcal để lịch tự cập nhật.
            </p>

            <div className="w-full max-w-lg flex flex-col gap-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Download className="h-4 w-4" /> Tải tệp lịch
                        </CardTitle>
                        <CardDescription>
                            File CSV có thể nhập vào Google Calendar; tệp .ics dùng cho
                            Apple Calendar, Outlook, ...
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        <Button variant="outline" disabled={!csvReady} onClick={downloadCsv}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Tải file CSV (.csv)
                        </Button>
                        <Button variant="outline" disabled={!icsReady} onClick={downloadIcs}>
                            <CalendarSync className="h-4 w-4 mr-2" />
                            Tải file lịch (.ics)
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Link2 className="h-4 w-4" /> Đăng ký Webcal
                        </CardTitle>
                        <CardDescription>
                            Dán URL này vào Google Calendar / Apple Calendar để lịch tự
                            đồng bộ theo dữ liệu lưu trên hệ thống.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {webcalUrl ? (
                            <div className="flex items-center gap-2">
                                <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs break-all">
                                    webcal://{webcalUrl.replace(/^https?:\/\//, "")}
                                </code>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() =>
                                        copy(
                                            `webcal://${webcalUrl.replace(/^https?:\/\//, "")}`
                                        )
                                    }
                                >
                                    {copied ? (
                                        <Check className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Đăng nhập lại để tạo URL đăng ký.
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Separator />

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarSync className="h-4 w-4" /> Google Calendar
                        </CardTitle>
                        <CardDescription>
                            Đồng bộ tự động lịch học và lịch thi vào Google Calendar của
                            bạn (nhắc trước 30 phút mỗi buổi học, 1 ngày trước mỗi kỳ thi).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 items-start">
                        {GOOGLE_CALENDAR_ENABLED ? (
                            <Button onClick={() => (window.location.href = "/api/google/auth")}>
                                <CalendarSync className="h-4 w-4 mr-2" />
                                Kết nối Google Calendar
                            </Button>
                        ) : (
                            <>
                                <Badge variant="secondary">Sắp ra mắt</Badge>
                                <p className="text-xs text-muted-foreground">
                                    Tính năng này cần cấu hình Google Cloud (xem README).
                                    Trong lúc đó bạn có thể dùng file .ics hoặc Webcal ở trên.
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
