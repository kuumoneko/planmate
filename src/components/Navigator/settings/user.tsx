"use client";
import { useEffect, useState } from "react";
import Logo from "../../Logo/index";
import Logout from "../../../utils/logout";

export default function User() {
    const [user, setuser] = useState<any>(null);

    useEffect(() => {
        setuser(JSON.parse(localStorage.getItem("user") ?? `{"name":null}`));
    }, []);

    const [logout, setlogout] = useState(false);

    useEffect(() => {
        async function run() {
            if (!logout || user === null) {
                return;
            }

            Logout();
            setlogout(false);
            window.location.href = "/dashboard";
        }
        run();
    }, [logout]);

    return (
        <div>
            <span className="flex flex-row justify-between items-center">
                {!user?.name ? (
                    <div
                        className="cursor-default"
                        onClick={() => {
                            window.location.href = "/login";
                        }}
                    >
                        <span className=" w-35 border-solid rounded-[50px] bg-slate-800 text-slate-100 py-1.25 px-2.5 flex flex-row hover:cursor-pointer hover:bg-slate-400 hover:text-slate-800">
                            <Logo height={25} width={25} />
                            <span className="ml-2 mt-0.5">Đăng nhập</span>
                        </span>
                    </div>
                ) : (
                    <span
                        className="cursor-default flex flex-row-reverse items-center justify-center bg-slate-800 rounded-3xl px-2.5 py-1.25 text-slate-100 hover:cursor-pointer hover:bg-slate-400 hover:text-slate-800"
                        onClick={() => {
                            setlogout(true);
                        }}
                    >
                        Đăng xuất
                    </span>
                )}
            </span>
        </div>
    );
}
