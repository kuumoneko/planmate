# BK Calendar

> A web built on Next.js to see schedule and manage subjects for studying in HCMUT - VNUHCM.
> Version: 8.2.0

## Tech Stack

- **Runtime / Package manager**: [Bun](https://bun.sh) (>= 1.3)
- **Framework**: Next.js 15 (Pages Router) + TypeScript
- **UI**: Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com), Lucide Icons
- **Database**: MongoDB (`mongodb` driver via `@vercel/functions`)
- **Calendar**: RFC 5545 `.ics` builder (no dependency) + `googleapis` (optional, flag-gated)

## Setup

```bash
# 1. Install Bun (Windows PowerShell):
powershell -c "irm bun.sh/install.ps1 | iex"

# 2. Install dependencies (generates bun.lock):
bun install

# 3. Configure environment (.env.local):
MONGODB_URI=mongodb+srv://...
# Optional — Google Calendar auto-sync:
NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/google/callback
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# 4. Run:
bun run dev
```

### Scripts (all Bun)

| Script | Command |
|---|---|
| dev | `PORT=3005 bun --bun next dev` |
| build | `bun --bun next build` |
| start | `PORT=3005 bun --bun next start` |
| test | `bun test` (Bun's built-in test runner) |
| typecheck | `bun --bun tsc --noEmit` |

## Features

- **HCMUT SSO login** (CAS via mybk) + offline cache when mybk is down.
- **Dashboard** (`/dashboard`): today's classes, exam countdown, group deadlines.
- **Weekly timetable grid** (`/schedule`): interactive Monday-Sunday × 06:00-22:00 grid with course details on hover.
- **Exam schedule** (`/exam`).
- **Export** (`/export`):
  - CSV import (Google Calendar legacy flow),
  - `.ics` download for Apple Calendar / Outlook,
  - **Webcal subscription URL**: `webcal://{host}/api/calendar/{mssv}.ics` (auto-updates from the server cache),
  - **Google Calendar OAuth sync** (flag-gated, see below).
- **Study groups (BTL)** (`/groups`):
  - Create groups, invite members by `@hcmut.edu.vn` email,
  - **Common free-time finder** (compares every member's cached schedule, 07:00-21:00 window, min 30 min slots),
  - Task & deadline manager with progress bar,
  - Creating a deadline auto-builds an invite `.ics` with all members as attendees, and pushes to Google Calendar when enabled.

## Google Calendar Sync (optional)

The OAuth flow is disabled unless `NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED=true` and
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set.

1. Create a project at https://console.cloud.google.com, enable the **Google Calendar API**.
2. Create an **OAuth client (Web)**, authorize `https://www.googleapis.com/auth/calendar.events`,
   and set the redirect URI to `{APP_URL}/api/google/callback`.
3. Set the env vars above. Users click "Kết nối Google Calendar" on `/export` to authorize.

Behaviour when enabled:
- Classes → recurring events (`RRULE` weekly + `EXDATE` for mid-semester breaks), 30-min popup reminder.
- Exams → one-shot events, 1-day email reminder.
- Group deadlines → event invites to all members (pushed via the leader's account).

## Vercel Deployment

- Set `BUN_VERSION=1.3.x` in project settings so installs use `bun install`.
- The Vercel runtime is always Node — production behaviour is identical to a Node build.

## IMPORTANT

> This web app is for educational purpose only.
>
> Do not use this web app for any illegal activity.
>
> Please check again with the source on mybk.hcmut.edu.vn/app before using the schedule from this web.
