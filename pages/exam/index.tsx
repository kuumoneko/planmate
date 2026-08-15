import Loading from "@/components/Loading";
import { ExamInfo } from "@/types";
import get_full_exam from "@/utils/data/exam";
import { useEffect, useState } from "react";
import ImportImageDialog from "@/components/import/ImportImageDialog";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export default function Exam_Schedule() {
    const [data, setdata] = useState<any[]>([]);
    const [loading, setloading] = useState(true);
    const [importOpen, setImportOpen] = useState(false);
    const [username, setUsername] = useState("");

    useEffect(() => {
        setUsername(JSON.parse(localStorage.getItem("user") ?? "{}")?.username ?? "");
    }, []);
    useEffect(() => {
        async function run() {
            const res = await get_full_exam();
            const temp = (res ?? [])
                .sort((a: ExamInfo, b: ExamInfo) => {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    return dateA.getTime() - dateB.getTime();
                })
                .filter((item: ExamInfo) => {
                    return new Date(item.date).getTime() > Date.now();
                });
            setdata(temp);
            setloading(false);
        }
        run();
    }, []);
    return (
        <div className="h-full w-full flex flex-col justify-center items-center overflow-y-auto">
            <div className="flex items-center gap-3">
                <span>Lịch thi</span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setImportOpen(true)}
                >
                    <Upload className="size-4" />
                    Tải lên lịch thi
                </Button>
            </div>
            <div className="w-[90%] overflow-x-auto">
                {data.length > 0 ? (
                    <table className="w-full text-center mt-5 rounded-3xl min-w-125">
                        <thead>
                            <tr className="h-12.5">
                                <th className="bg-slate-600 border-2 w-[30%] min-w-37.5">
                                    Môn thi
                                </th>
                                <th className="bg-slate-700 border-2 w-[20%] min-w-37.5">
                                    Lớp
                                </th>
                                <th className="bg-slate-600 border-2 w-[15%] min-w-12.5">
                                    Ngày
                                </th>
                                <th className="bg-slate-700 border-2 w-[10%] min-w-12.5">
                                    Bắt đầu
                                </th>
                                <th className="bg-slate-600 border-2 w-[10%] min-w-12.5">
                                    Thời gian thi
                                </th>
                                <th className="bg-slate-700 border-2 w-[20%] min-w-12.5">
                                    Phòng thi
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(
                                (item: {
                                    subject: string;
                                    date: string;
                                    building: string;
                                    room: string;
                                    startTime: string;
                                    duration: string;
                                    class: string;
                                }) => {
                                    return (
                                        <tr
                                            key={item.subject}
                                            className="h-12.5"
                                        >
                                            <td
                                                className={
                                                    "border-2 bg-slate-600"
                                                }
                                            >
                                                {item.subject}
                                            </td>
                                            <td
                                                className={
                                                    "border-2 bg-slate-700"
                                                }
                                            >
                                                {item.class}
                                            </td>
                                            <td
                                                className={
                                                    "border-2 bg-slate-600"
                                                }
                                            >
                                                {item.date}
                                            </td>
                                            <td
                                                className={
                                                    "border-2 bg-slate-700"
                                                }
                                            >
                                                {item.startTime}
                                            </td>
                                            <td
                                                className={
                                                    "border-2 bg-slate-600"
                                                }
                                            >
                                                {item.duration}
                                            </td>
                                            <td
                                                className={
                                                    "border-2 bg-slate-700"
                                                }
                                            >
                                                {item.building.includes("DiAn")
                                                    ? "CS2 - "
                                                    : "CS1 - "}
                                                {item.room}
                                            </td>
                                        </tr>
                                    );
                                }
                            )}
                        </tbody>
                    </table>
                ) : data.length === 0 && !loading ? (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                        <span className="text-lg font-medium">
                            Không có lịch thi
                        </span>
                        <span className="text-sm text-muted-foreground">
                            Chụp màn hình bảng lịch thi từ mybk và tải lên để
                            tự động thêm lịch thi.
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setImportOpen(true)}
                        >
                            <Upload className="size-4" />
                            Tải lên lịch thi
                        </Button>
                    </div>
                ) : (
                    <Loading mode="Đang tải lịch thi" />
                )}
            </div>
            <ImportImageDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                kind="exam"
                username={username}
                onImported={() => window.location.reload()}
            />
        </div>
    );
}
