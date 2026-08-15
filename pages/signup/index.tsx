import Hcmut_Logo from "@/components/Logo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useOrientationMode } from "@/hooks/display";
import logining from "@/utils/data/login";
import { convert } from "@/lib/pass";

const PASSWORD_RULE =
    /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]).{8,}$/;

export default function Signup() {
    useEffect(() => {
        const user = JSON.parse(
            localStorage.getItem("user") ?? `{"name":null}`
        );
        if (user.name !== null) {
            alert("Bạn đã đăng nhập trước đó.");
            window.location.href = "/";
        }
    }, []);

    const [username, setusername] = useState("");
    const [name, setname] = useState("");
    const [password, serpassword] = useState("");
    const [confirm, serconfirm] = useState("");
    const [hidden, sethidden] = useState(true);
    const [signup, setsignup] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!signup) {
            return;
        }
        setError(null);
        const uname = username.trim();
        if (uname.length === 0 || /\s/.test(uname)) {
            alert("Tên đăng nhập không hợp lệ. Không được chứa khoảng trắng.");
            return setsignup(false);
        }
        if (name.trim().length === 0) {
            alert("Vui lòng nhập tên hiển thị");
            return setsignup(false);
        }
        if (!PASSWORD_RULE.test(password)) {
            alert(
                "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, số và ký tự đặc biệt (! @ # ...)."
            );
            return setsignup(false);
        }
        if (password !== confirm) {
            alert("Mật khẩu xác nhận không khớp");
            return setsignup(false);
        }
        async function run() {
            try {
                const res = await fetch("/api/signup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: uname, name: name.trim(), password: password }),
                });
                const json = await res.json();
                if (!json.ok) {
                    setError(json.data ?? "Không tạo được tài khoản");
                    return setsignup(false);
                }
                await logining(uname, convert(password));
                setsignup(false);
            } catch (e: any) {
                setError(e?.message ?? "Không kết nối được máy chủ");
                setsignup(false);
            }
        }
        run();
    }, [signup]);

    const mode = useOrientationMode();

    return (
        <>
            <div
                className={`login ml-15 ${
                    mode === "row" ? "mt-10" : "mt-6"
                } flex flex-col items-center h-full w-[80%] overflow-y-auto`}
            >
                <h1 className="text-3xl w-full font-bold text-center mb-5 border-b-2 pb-3 flex flex-row items-center justify-center">
                    <Hcmut_Logo height={40} width={40} />
                    Đăng ký tài khoản
                </h1>
                <div className="login_form flex flex-col">
                    <form className="flex flex-col cursor-default select-none">
                        <div className="flex flex-col w-full">
                            <label htmlFor="username">Tên đăng nhập:</label>
                            <input
                                className="text-slate-800 w-[95%] bg-slate-500 rounded-2xl px-4"
                                type="text"
                                name="username"
                                id="username"
                                value={username}
                                onChange={(e) => setusername(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col w-full mt-1">
                            <label htmlFor="name">Tên hiển thị:</label>
                            <input
                                className="text-slate-800 w-[95%] bg-slate-500 rounded-2xl px-4"
                                type="text"
                                name="name"
                                id="name"
                                value={name}
                                onChange={(e) => setname(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col w-full mt-1">
                            <label htmlFor="password">Mật khẩu:</label>
                            <div className="flex flex-row ">
                                <input
                                    className="text-slate-800 w-[95%] mr-1.25 bg-slate-500 rounded-2xl px-4"
                                    type={hidden ? "password" : "text"}
                                    name="password"
                                    id="password"
                                    value={password}
                                    onChange={(e) => {
                                        serpassword(e.target.value);
                                    }}
                                />
                                <div>
                                    <FontAwesomeIcon
                                        icon={hidden ? faEye : faEyeSlash}
                                        onClick={() => {
                                            sethidden(!hidden);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col w-full mt-1">
                            <label htmlFor="confirm">Xác nhận mật khẩu:</label>
                            <input
                                className="text-slate-800 w-[95%] bg-slate-500 rounded-2xl px-4"
                                type={hidden ? "password" : "text"}
                                name="confirm"
                                id="confirm"
                                value={confirm}
                                onChange={(e) => {
                                    serconfirm(e.target.value);
                                }}
                            />
                        </div>
                        {error && (
                            <div className="mt-4 flex w-[95%] items-start gap-2.5 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                        <div className="flex flex-row-reverse items-start mt-5 w-[95%]">
                            <div
                                className="ml-10 bg-indigo-500 px-3 py-1.5 rounded-2xl hover:cursor-pointer"
                                onClick={() => {
                                    setsignup(true);
                                }}
                            >
                                {!signup ? (
                                    <span>Đăng ký</span>
                                ) : (
                                    <span>Đang đăng ký...</span>
                                )}
                            </div>
                        </div>
                        <div className="mt-2 flex w-[95%] items-center justify-center">
                            <span className="text-sm text-slate-400">
                                Đã có tài khoản?{" "}
                                <a
                                    href="/login"
                                    className="text-indigo-400 underline underline-offset-2"
                                >
                                    Đăng nhập
                                </a>
                            </span>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}