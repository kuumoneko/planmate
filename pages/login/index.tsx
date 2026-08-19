import Hcmut_Logo from "@/components/Logo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { useState, useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import logining from "@/utils/data/login";
import { convert } from "@/lib/pass";
import {
    clearLocalLoginChoice,
    getLocalLoginChoice,
    isMybkUsername,
    setLocalLoginChoice,
} from "@/lib/username-rule";

export default function Login() {
    useEffect(() => {
        const user = JSON.parse(
            localStorage.getItem("user") ?? `{"name":null}`
        );
        if (user.name !== null) {
            alert("Bạn đã đăng nhập trước đó.");
            window.location.href = "/";
        }
    }, []);

    const [username, serusername] = useState("");
    const [password, serpassword] = useState("");
    const [hidden, sethidden] = useState(true);
    const [login, setlogin] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [askLocal, setAskLocal] = useState<string | null>(null);
    const skipAskRef = useRef("");

    useEffect(() => {
        if (!login) {
            return;
        }
        setError(null);
        setNotice(null);
        if (username.length === 0 || password.length === 0) {
            alert("Vui lòng nhập tài khoản và mật khẩu");
            return setlogin(false);
        }
        const normalized = username.trim();
        if (!isMybkUsername(normalized) && skipAskRef.current !== normalized) {
            if (!getLocalLoginChoice(normalized)) {
                setAskLocal(normalized);
                return setlogin(false);
            }
        }
        skipAskRef.current = "";
        async function run() {
            try {
                await logining(normalized, convert(password), {
                    localOnly: !isMybkUsername(normalized),
                });
                setlogin(false);
            } catch (e: any) {
                setError(e?.message ?? "Đăng nhập thất bại");
                setlogin(false);
            }
        }
        run();
    }, [login]);

    const confirmLocal = (remember: boolean) => {
        const name = askLocal;
        setAskLocal(null);
        if (!name) return;
        if (remember) {
            setLocalLoginChoice(name);
        }
        else {
            skipAskRef.current = name;
        }
        setlogin(true);
    };

    const forgetChoice = () => {
        clearLocalLoginChoice(username.trim());
        setNotice(`Đã quên lựa chọn cho «${username.trim()}».`);
    };

    const savedLocalChoice =
        username.trim().length > 0 && getLocalLoginChoice(username.trim());

    return (
        <>
            <div className="login self-center flex flex-col items-center h-full w-full max-w-md px-4 overflow-y-auto">
                <h1 className="text-3xl w-full font-bold text-center mb-5 border-b-2 pb-3 flex flex-row items-center justify-center mt-auto">
                    <Hcmut_Logo height={40} width={40} />
                    Đăng nhập
                </h1>
                <div className="login_form flex flex-col mb-auto">
                    {askLocal ? (
                        <div className="flex w-[95%] flex-col gap-3 rounded-xl bg-slate-800 px-4 py-4 text-sm">
                            <div className="flex items-start gap-2.5">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                                <div className="flex flex-col gap-1">
                                    <p>
                                        Tên đăng nhập{" "}
                                        <span className="font-medium text-slate-100">
                                            «{askLocal}»
                                        </span>{" "}
                                        không giống tài khoản trường (VD:{" "}
                                        <span className="font-mono">viet.anh9q1</span>).
                                    </p>
                                    <p>
                                        Bạn có muốn đăng nhập bằng tài khoản cục bộ
                                        không?
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <div
                                    className="bg-indigo-500 px-3 py-1.5 rounded-2xl text-center text-white hover:cursor-pointer"
                                    onClick={() => confirmLocal(true)}
                                >
                                    Có, nhớ lựa chọn
                                </div>
                                <div
                                    className="bg-slate-600 px-3 py-1.5 rounded-2xl text-center hover:cursor-pointer"
                                    onClick={() => confirmLocal(false)}
                                >
                                    Chỉ lần này
                                </div>
                                <div
                                    className="bg-slate-700 px-3 py-1.5 rounded-2xl text-center hover:cursor-pointer"
                                    onClick={() => setAskLocal(null)}
                                >
                                    Hủy
                                </div>
                            </div>
                        </div>
                    ) : (
                    <form className="flex flex-col cursor-default select-none">
                        <div className="flex flex-col w-full">
                            <label htmlFor="username">Tên tài khoản:</label>
                            <input
                                className="text-slate-800 w-full bg-slate-500 rounded-2xl px-4 py-1.5"
                                type="text"
                                name="username"
                                id="username"
                                value={username}
                                onChange={(e) => serusername(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col w-full mt-1">
                            <label htmlFor="password">Mật khẩu:</label>
                            <div className="flex flex-row items-center gap-2 w-full">
                                <input
                                    className="text-slate-800 flex-1 min-w-0 bg-slate-500 rounded-2xl px-4 py-1.5"
                                    type={hidden ? "password" : "text"}
                                    name="password"
                                    id="password"
                                    value={password}
                                    onChange={(e) => {
                                        serpassword(e.target.value);
                                    }}
                                />
                                <div className="shrink-0">
                                    <FontAwesomeIcon
                                        icon={hidden ? faEye : faEyeSlash}
                                        onClick={() => {
                                            sethidden(!hidden);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        {error && (
                            <div className="mt-4 flex w-[95%] items-start gap-2.5 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                        {notice && (
                            <div className="mt-4 flex w-[95%] items-start gap-2.5 rounded-xl bg-slate-500/15 px-4 py-3 text-sm text-slate-300 ring-1 ring-slate-500/30">
                                <span>{notice}</span>
                            </div>
                        )}
                        <div className="flex flex-row-reverse items-start mt-5 w-full">
                            <div
                                className="bg-indigo-500 px-3 py-1.5 rounded-2xl text-white hover:cursor-pointer"
                                onClick={() => {
                                    setlogin(true);
                                }}
                            >
                                {!login ? (
                                    <span>Đăng nhập</span>
                                ) : (
                                    <span>Đang đăng nhập...</span>
                                )}
                            </div>
                        </div>
                        <div className="mt-2 flex w-[95%] items-center justify-center">
                            <span className="text-sm text-slate-400">
                                Chưa có tài khoản?{" "}
                                <a
                                    href="/signup"
                                    className="text-indigo-400 underline underline-offset-2"
                                >
                                    Đăng ký
                                </a>
                            </span>
                        </div>
                        {savedLocalChoice && (
                            <div className="mt-1 flex w-[95%] items-center justify-center">
                                <span
                                    className="text-xs text-slate-500 underline underline-offset-2 hover:cursor-pointer"
                                    onClick={forgetChoice}
                                >
                                    Quên lựa chọn?
                                </span>
                            </div>
                        )}
                    </form>
                    )}
                </div>
            </div>
        </>
    );
}
