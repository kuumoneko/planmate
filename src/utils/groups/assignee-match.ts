import type { GroupMember } from "@/types";

/**
 * Map a Gemini-extracted assignee name ("Linh", "Mai Ngọc Nhật", "alex_dev")
 * onto a group member. Matching is diacritic- and case-insensitive and tries,
 * in order: exact whole-string match against fullName / email / username /
 * email prefix, then a token-level match against the member's full name.
 */

export interface AssigneeMatchResult {
    member: GroupMember;
    /** "exact" = the whole assignee string equals a member key; "partial" = token-level. */
    confidence: "exact" | "partial";
}

export interface AssigneeMatchOptions {
    /** Member emails to skip (e.g. already chosen for another row). */
    excludeEmails?: string[];
}

/** Lowercase, strip Vietnamese diacritics, collapse non-alphanumerics to spaces. */
export function normalizeForMatch(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function memberKeys(member: GroupMember): string[] {
    const keys: string[] = [member.fullName, member.email];
    if (member.username) keys.push(member.username);
    if (member.email.includes("@")) keys.push(member.email.split("@")[0]);
    return keys.map(normalizeForMatch).filter(Boolean);
}

export function matchAssigneeToMember(
    assignee: string | null | undefined,
    members: GroupMember[],
    options: AssigneeMatchOptions = {}
): AssigneeMatchResult | null {
    const raw = (assignee ?? "").trim();
    if (!raw || /unassigned/i.test(raw)) return null;

    const excluded = new Set((options.excludeEmails ?? []).map((e) => e.toLowerCase()));
    const candidates = members.filter((m) => !excluded.has(m.email.toLowerCase()));
    if (candidates.length === 0) return null;

    const normalized = normalizeForMatch(raw);

    // 1) Exact: the whole normalized assignee equals one of the member keys.
    for (const member of candidates) {
        if (memberKeys(member).some((key) => key === normalized)) {
            return { member, confidence: "exact" };
        }
    }

    // 2) Partial: any token of the assignee is a token of a member's full name.
    const tokens = normalized.split(" ").filter(Boolean);
    if (tokens.length === 0) return null;
    for (const member of candidates) {
        const nameTokens = new Set(
            normalizeForMatch(member.fullName).split(" ").filter(Boolean)
        );
        if (tokens.some((token) => nameTokens.has(token))) {
            return { member, confidence: "partial" };
        }
    }

    return null;
}
