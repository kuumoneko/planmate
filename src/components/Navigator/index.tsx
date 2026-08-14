"use client";
import { useOrientationMode } from "@/hooks/display";
import { useTheme } from "@/hooks/useTheme";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import Hcmut from "./settings/hcmut";
import { convertDateFormat, getnow } from "@/utils/day";

export default function Nav() {
    const { week } = getnow();
    const mode = useOrientationMode();
    const { theme, toggle } = useTheme();

    const today =
        mode === "row"
            ? convertDateFormat(
                  new Intl.DateTimeFormat("en-CA").format(new Date())
              )
            : new Intl.DateTimeFormat("en-US", {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
              }).format(new Date());

    return (
        <div className="nav bg-slate-700 h-[5%] w-[90%] flex justify-between items-center rounded-full p-6 mt-2.5">
            <div
                className="title"
                onClick={() => {
                    window.location.href = "/";
                }}
            >
                <span className="cursor-auto select-none text-slate-800 dark:text-white hover:cursor-pointer">
                    BK Calendar
                </span>
            </div>
            {mode === "row" ? (
                <div>
                    Tuần {week} - {today}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center">
                    <div>Tuần {week}</div>
                    <div>{today}</div>
                </div>
            )}

            <div className="settings flex flex-row justify-between items-center gap-2">
                <div
                    className="hover:cursor-pointer hover:bg-slate-400 hover:text-slate-800 px-2.5 py-1.25 text-slate-100 rounded-3xl bg-slate-800"
                    onClick={toggle}
                    title={theme === "dark" ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
                >
                    <FontAwesomeIcon
                        icon={theme === "dark" ? faSun : faMoon}
                        className="pointer-events-none"
                    />
                </div>
                <div className="hover:cursor-pointer hover:bg-slate-400 hover:text-slate-800 px-2.5 py-1.25 text-slate-100 rounded-3xl bg-slate-800" onClick={() => {window.location.href = "/export";}}>
                    Export
                </div>
                <Hcmut />
            </div>
        </div>
    );
}
