import type { NextApiRequest, NextApiResponse } from "next";
import { parse_body } from "./data";
import create_login from "./sso/page";
import get_token from "./mybk/app/app";
import { login as login_user } from "./sso/login";
import create_app from "./mybk/app/login";
import { revert } from "@/lib/pass";

/**
 * Login user
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const { username, password } = parse_body(req.body)

        if (username.length === 0) {
            return "";
        }
        if (password.length === 0) {
            return "";
        }
        const normalized = username.trim().split("@")[0];
        if (!/^[a-z]+\.[a-z]+[a-z0-9]+$/i.test(normalized)) {
            return res.status(200).json({ data: "Tên đăng nhập không hợp lệ. Phải có dạng <tên>.<họ><kí tự ngẫu nhiên> — VD: viet.anh9q1", ok: false });
        }
        const { JSESSIONID, ltValue, executionValue } =
            await create_login();
        const result = await login_user(
            ltValue || "",
            executionValue || "",
            normalized,
            revert(password),
            JSESSIONID || "",
        );

        const SESSION = await create_app(result as string);
        let token = await get_token(SESSION as string);
        return res.status(200).json({ data: token, ok: true });
    }
    catch (e: any) {
        console.error(e)
        return res.status(200).json({ data: e.message, ok: false });
    }
}
