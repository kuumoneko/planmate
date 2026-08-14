/**
 * Thin fetch wrapper matching the app's { ok, data } response convention.
 * Throws with the server message on failure so callers can show errors.
 */
export async function api<T = any>(
    url: string,
    options: { method?: string; body?: any } = {}
): Promise<T> {
    const res = await fetch(url, {
        method: options.method ?? "GET",
        headers: { "Content-Type": "application/json" },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const json = await res.json().catch(() => ({ ok: false, data: "Invalid response" }));
    if (!json.ok) {
        throw new Error(json.data ?? "Lỗi không xác định");
    }
    return json.data as T;
}
