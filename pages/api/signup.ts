import { NextApiRequest, NextApiResponse } from "next";
import Mongo_client_Component from "@/lib/mongodb";
import { hash } from "@/lib/auth/hash";
import { convert } from "@/lib/pass";

const PASSWORD_RULE =
    /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]).{8,}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const { username, name, password } = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
        const uname = String(username ?? "").trim();
        const displayName = String(name ?? "").trim();
        const pass = String(password ?? "");

        if (uname.length === 0 || /\s/.test(uname)) {
            return res.status(200).json({ ok: false, data: "Tên đăng nhập không hợp lệ. Không được chứa khoảng trắng." });
        }
        if (displayName.length === 0) {
            return res.status(200).json({ ok: false, data: "Vui lòng nhập tên hiển thị." });
        }
        if (!PASSWORD_RULE.test(pass)) {
            return res.status(200).json({ ok: false, data: "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, số và ký tự đặc biệt (! @ # ...)." });
        }

        const client = await Mongo_client_Component();
        await client.connect();
        const collection = client.db("hcmut").collection("data");

        const escaped = uname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const existing = await collection.findOne({
            username: { $regex: `^${escaped}$`, $options: "i" },
        });
        if (existing) {
            return res.status(200).json({ ok: false, data: "Tên đăng nhập đã tồn tại." });
        }

        await collection.insertOne({
            username: uname,
            password: convert(await hash(pass)),
            user: { name: displayName },
            schedule: null,
            exam: null,
            filter: null,
            data: null,
        });

        return res.status(200).json({ ok: true, data: { username: uname } });
    }
    catch (e: any) {
        console.error(e);
        return res.status(200).json({ ok: false, data: "Không tạo được tài khoản. Vui lòng thử lại." });
    }
}