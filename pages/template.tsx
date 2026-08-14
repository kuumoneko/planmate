import Footer from "@/components/Footer";
import Nav from "@/components/Navigator";
import Sidebar from "@/components/Sidebar";
import { useOrientationMode } from "@/hooks/display";
import { useEffect } from "react";

export default function Template({ children }: { children: React.ReactNode }) {
    const mode = useOrientationMode();

    useEffect(() => {
        if (document.referrer === "") {
            localStorage.setItem("offline", "false");
            localStorage.setItem("error", "");
            const stored = localStorage.getItem("user");
            const loggedIn = stored ? (JSON.parse(stored)?.name ?? null) !== null : false;
            if (!loggedIn) {
                window.location.href = "/login";
            }
        }
    }, []);

    return (
        <div
            className={
                "flex flex-col bg-slate-900 h-screen h-dvh w-screen items-center justify-center m-0 p-0 select-none cursor-default overflow-hidden"
            }
        >
            <div className="flex flex-col bg-slate-900 h-full w-full items-center justify-start m-0 p-0 select-none cursor-default min-h-0">
                <Nav />
                <div
                    className={`flex ${
                        mode === "row" ? "flex-row" : "flex-col"
                    } flex-1 min-h-0 w-[95%] mt-3.75`}
                >
                    <Sidebar mode={mode} />
                    <main className="flex-1 min-h-0 min-w-0 flex flex-col">
                        {children && children}
                    </main>
                </div>
                <Footer />
            </div>
        </div>
    );
}
