export default async function login_db(username: string, password: string) {
    if (username.length === 0) {
        throw new Error("Invalid username")
    }
    if (password.length === 0) {
        throw new Error("Invalid password")
    }
    try {
        const res = await fetch("/api/mongodb/hcmut", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                doc: "password",
                mode: "get",
                data: { username: username, password: password }
            })
        });
        const { ok, data } = await res.json();
        return Boolean(ok && data === true);
    }
    catch {
        return false;
    }
}