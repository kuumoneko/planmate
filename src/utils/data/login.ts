import get_student_data from "@/utils/data/hcmut/api/student";
import login_db from "@/utils/data/databsae/login";
import mongodb from "@/utils/data/databsae";
import get_web_semester from "./hcmut/api/semester";
import deepEqual from "../object";
import { revert } from "@/lib/pass";

export default async function logining(username: string, password: string) {

    username = username.trim().split("@")[0];

    let result, token: string | undefined = "";
    await Promise.all([
        login_db(username, revert(password)).then((res: any) => {
            result = res;
        }),
        fetch_login(username, password).then((res: string | undefined) => {
            token = res;
        })
    ])

    if (token === "ok" || token === undefined) {
        if (!result) {
            throw new Error("Không thể xác minh tài khoản qua mybk và hệ thống không có dữ liệu phù hợp. Vui lòng kiểm tra lại tên đăng nhập hoặc mật khẩu.");
        }
        const db_user = await mongodb("user", "get", { username: username });
        if (!(db_user?.name || db_user?.user?.name)) {
            throw new Error("Không thể xác minh tài khoản qua mybk và tài khoản không có dữ liệu trong hệ thống. Vui lòng kiểm tra lại tên đăng nhập hoặc mật khẩu.");
        }
        localStorage.setItem("token", "");
        localStorage.setItem("offline", "true");
    }

    const data_promises: any[] = [];

    let database_user: any, database_semester, mybk_user: any, mybk_semester;

    data_promises.push(
        mongodb("user", "get", { username: username }).then((res: any) => {
            const { _id, username, ...data } = res;

            database_user = data;
        })
    )
    if (token !== "ok") {
        data_promises.push(
            get_student_data(token as string).then((res: any) => {
                mybk_user = res;
            })
        )
        data_promises.push(
            get_web_semester().then((res: string) => {
                mybk_semester = res
            })
        )
    }

    await Promise.all(data_promises);

    let user;

    if (token !== "ok") {
        if (!deepEqual(mybk_user, database_user)) {
            await mongodb("user", "post", {
                username: username, data: {
                    ...mybk_user,
                    semester: mybk_semester
                }
            })
        }
        user = {
            username: username,
            ...mybk_user,
            semester: mybk_semester
        };
    }
    else {
        user = {
            username: username,
            ...database_user,
            semester: database_semester
        };
    }
    localStorage.setItem("token", token as string);
    localStorage.setItem("user", JSON.stringify(user));
    const expires = new Date().getTime() + 2 * 60 * 60 * 1000;
    localStorage.setItem("expires", expires.toString());
    window.location.href = "/";
}

async function fetch_login(username: string, password: string): Promise<string | undefined> {
    try {
        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username, password: password })
        });
        const { ok, data } = await res.json();
        if (ok) {
            return data ?? "ok";
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}