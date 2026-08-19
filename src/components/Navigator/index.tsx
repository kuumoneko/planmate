"use client";
import { useOrientationMode } from "@/hooks/display";
import { useTheme } from "@/hooks/useTheme";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import Hcmut from "./settings/user";
import Hcmut_Logo from "@/components/Logo";
import { convertDateFormat, getnow } from "@/utils/day";
import User from "./settings/user";

export default function Nav() {
    const { week } = getnow();
    const mode = useOrientationMode();
    const { theme, toggle } = useTheme();

    const today =
        mode === "row"
            ? convertDateFormat(
                  new Intl.DateTimeFormat("en-CA").format(new Date()),
              )
            : new Intl.DateTimeFormat("en-US", {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
              }).format(new Date());

    return (
        <div className="nav bg-slate-700 w-[90%] shrink-0 flex justify-between items-center gap-2 flex-wrap rounded-full px-5 py-2 mt-2.5">
            <div
                className="title flex flex-row items-center gap-1.5"
                onClick={() => {
                    window.location.href = "/";
                }}
            >
                <Hcmut_Logo height={22} width={22} />
                <span className="cursor-auto select-none text-slate-800 dark:text-white hover:cursor-pointer">
                    NoZal
                </span>
            </div>
            {mode === "row" ? (
                <div className="text-xs sm:text-sm">
                    Tuần {week} - {today}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center text-xs">
                    <div>Tuần {week}</div>
                    <div>{today}</div>
                </div>
            )}

            <div className="settings flex flex-row justify-between items-center gap-2">
                <div
                    className="hover:cursor-pointer hover:bg-slate-400 hover:text-slate-800 px-2.5 py-1.25 text-slate-100 rounded-3xl bg-slate-800"
                    onClick={toggle}
                    title={
                        theme === "dark"
                            ? "Chuyển sang chế độ sáng"
                            : "Chuyển sang chế độ tối"
                    }
                >
                    <FontAwesomeIcon
                        icon={theme === "dark" ? faSun : faMoon}
                        className="pointer-events-none"
                    />
                </div>
                <div
                    className="hover:cursor-pointer hover:bg-slate-400 hover:text-slate-800 px-2.5 py-1.25 text-slate-100 rounded-3xl bg-slate-800"
                    onClick={() => {
                        window.location.href = "/export";
                    }}
                >
                    Export
                </div>
                <User />
            </div>
        </div>
    );
}
