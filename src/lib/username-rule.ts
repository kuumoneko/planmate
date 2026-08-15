/**
 * mybk username detection + remembered local-login choices.
 *
 * mybk (HCMUT SSO) usernames look like `viet.anh9q1` — two dotted parts of
 * lowercase letters/digits. Anything else (e.g. local-account usernames like
 * `kuumoneko`) can only be an app-local account, so the login page offers a
 * "login with local account?" confirmation and remembers the choice per
 * username in localStorage.
 */

export const MYBK_USERNAME_RE = /^[a-z0-9]+\.[a-z0-9]+$/i;

/** Normalize like the login flow does: trim + drop any @domain part. */
export function normalizeUsername(username: string): string {
    return username.trim().split("@")[0];
}

/** True when the username looks like a mybk account (two dotted parts). */
export function isMybkUsername(username: string): boolean {
    return MYBK_USERNAME_RE.test(normalizeUsername(username));
}

const CHOICE_PREFIX = "localLogin:";

function choiceKey(username: string): string {
    return `${CHOICE_PREFIX}${normalizeUsername(username)}`;
}

/** Has the user already confirmed local login for this username? */
export function getLocalLoginChoice(username: string): boolean {
    try {
        return localStorage.getItem(choiceKey(username)) === "1";
    } catch {
        return false;
    }
}

/** Remember that this username logs in as a local account. */
export function setLocalLoginChoice(username: string): void {
    try {
        localStorage.setItem(choiceKey(username), "1");
    } catch {
        // storage unavailable — the ask will simply reappear next time
    }
}

/** Forget the remembered local-login choice for this username. */
export function clearLocalLoginChoice(username: string): void {
    try {
        localStorage.removeItem(choiceKey(username));
    } catch {
        // ignore
    }
}