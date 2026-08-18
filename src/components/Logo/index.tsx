import { GraduationCap } from "lucide-react";

export default function Hcmut_Logo({
    height = 20,
    width = 20,
}: {
    height?: number;
    width?: number;
}) {
    return (
        <span
            className="inline-flex items-center justify-center rounded-full bg-slate-600 text-slate-800 dark:text-slate-100 mr-1.25"
            style={{ height, width }}
            title="Sinh viên"
        >
            <GraduationCap size={Math.round(Math.min(height, width) * 0.7)} />
        </span>
    );
}
