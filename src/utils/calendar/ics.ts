import { CalendarEventDraft } from "@/types";
import { TZID } from "./parser";

/**
 * Dependency-free RFC 5545 (iCalendar) builder.
 *
 * Design notes:
 * - CRLF line endings (required by the spec; some clients reject LF-only).
 * - 75-octet line folding, done per UTF-8 code point so multibyte
 *   Vietnamese characters are never split across lines.
 * - All times are local (Asia/Ho_Chi_Minh) with explicit TZID — the
 *   floating-time approach that Google / Apple / Outlook resolve correctly.
 */

const CRLF = "\r\n";
const FOLD_MAX_OCTETS = 75;

/** Escape text per RFC 5545 for SUMMARY/DESCRIPTION/LOCATION. */
function escapeText(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}

/**
 * Fold long lines at UTF-8 octet boundaries (RFC 5545 §3.1).
 * Continuation lines start with a single space.
 */
function foldLine(line: string): string {
    const encoder = new TextEncoder();
    if (encoder.encode(line).length <= FOLD_MAX_OCTETS) return line;

    const chunks: string[] = [];
    let current = "";
    for (const char of line) {
        const candidate = current + char;
        if (encoder.encode(candidate).length > FOLD_MAX_OCTETS) {
            chunks.push(current);
            current = char;
        } else {
            current = candidate;
        }
    }
    if (current.length > 0) chunks.push(current);

    return chunks.join(`${CRLF} `);
}

/** "yyyy-MM-ddTHH:mm" -> "yyyyMMddTHHmmss" (RFC 5545 local date-time). */
function toLocalDateTime(value: string): string {
    return `${value.replace(/-/g, "").replace("T", "T").replace(":", "")}00`;
}

/** "yyyy-MM-dd" -> "yyyyMMdd". */
function toDateOnly(value: string): string {
    return value.replace(/-/g, "");
}

/** UIDs must avoid ":" and other delimiters that break parsers. */
function sanitizeUid(uid: string): string {
    return uid.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function reminderBlock(reminder: {
    method: "popup" | "email";
    minutesBefore: number;
}): string {
    // minutesBefore -> RFC 5545 duration: -PT{min}M / -P1D
    const days = Math.floor(reminder.minutesBefore / 1440);
    const mins = reminder.minutesBefore % 1440;
    const trigger = days > 0 ? `-P${days}D` : `-PT${mins}M`;

    if (reminder.method === "email") {
        return [
            "BEGIN:VALARM",
            "ACTION:EMAIL",
            "DESCRIPTION:This is an event reminder",
            `TRIGGER:${trigger}`,
            "END:VALARM",
        ].join(CRLF);
    }
    return [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:This is an event reminder",
        `TRIGGER:${trigger}`,
        "END:VALARM",
    ].join(CRLF);
}

/** One VEVENT (multi-line, not yet folded). */
function eventBlock(event: CalendarEventDraft, owner?: string): string {
    const uid = sanitizeUid(`${owner ? `${owner}-` : ""}${event.uid}`);
    const dtstamp = new Date()
        .toISOString()
        .replace(/-/g, "")
        .replace("T", "T")
        .slice(0, 15) + "Z";

    const lines: string[] = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${dtstamp}`];

    if (event.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${toDateOnly(event.startLocal.slice(0, 10))}`);
        // DTEND is exclusive -> day after the event date
        const end = new Date(`${event.startLocal.slice(0, 10)}T00:00:00`);
        end.setDate(end.getDate() + 1);
        lines.push(`DTEND;VALUE=DATE:${toDateOnly(end.toISOString().slice(0, 10))}`);
    } else {
        lines.push(`DTSTART;TZID=${TZID}:${toLocalDateTime(event.startLocal)}`);
        lines.push(`DTEND;TZID=${TZID}:${toLocalDateTime(event.endLocal)}`);
    }

    if (event.rrule) lines.push(`RRULE:${event.rrule}`);
    if (event.exdates.length > 0) {
        lines.push(
            `EXDATE;TZID=${TZID};VALUE=DATE:${event.exdates
                .map(toDateOnly)
                .join(",")}`
        );
    }

    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);

    for (const attendee of event.attendees ?? []) {
        lines.push(`ATTENDEE;CN=${escapeText(attendee.name || attendee.email)};PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}`);
    }

    for (const reminder of event.reminders) {
        lines.push(reminderBlock(reminder));
    }

    lines.push("END:VEVENT");
    return lines.join(CRLF);
}

export interface IcsOptions {
    owner?: string;
    calendarName?: string;
}

/** Build a complete, folded iCalendar document. */
export function buildIcs(events: CalendarEventDraft[], options: IcsOptions = {}): string {
    const header = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//BK Calendar//HCMUT Schedule//VI",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${escapeText(options.calendarName ?? "Lịch học - BK Calendar")}`,
        "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
    ];

    const body = events.map((ev) => eventBlock(ev, options.owner));

    return [...header, ...body, "END:VCALENDAR"]
        .map(foldLine)
        .join(CRLF) + CRLF;
}
