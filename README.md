# PlanMate

> Công cụ web xem thời khóa biểu, lịch thi và quản lý deadline, nhóm học tập dành cho sinh viên trường Đại học Bách Khoa - Đại học Quốc gia TP.HCM.
> Version: 1.0.0

> [!IMPORTANT]
> Đây là dự án **báo cáo môn học** được xây dựng cho mục đích học tập. Ứng dụng **không phải là sản phẩm production** cho bất kỳ mục đích nào — không đảm bảo độ sẵn sàng, bảo mật hay tính chính xác của dữ liệu.

## Công nghệ

- **Runtime / Package manager**: [Bun](https://bun.sh) (>= 1.3)
- **Framework**: Next.js 16 (Pages Router + App Router APIs) + TypeScript
- **UI**: React 19, Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com), Lucide Icons
- **Database**: MongoDB (`mongodb` driver)
- **AI**: Google Gemini ([`@google/genai`](https://www.npmjs.com/package/@google/genai)) cho nhập liệu ảnh và phân tích deadline LMS
- **Calendar**: RFC 5545 `.ics` (thư viện `ics`) + `googleapis` (tùy chọn, cờ bật/tắt)

## Cài đặt

```bash
# 1. Cài Bun (Windows PowerShell):
powershell -c "irm bun.sh/install.ps1 | iex"

# 2. Cài dependencies (tạo bun.lock):
bun install

# 3. Cấu hình .env (tạo file .env trong thư mục gốc):
MONGODB_URI=mongodb+srv://...
GEMINI_API_KEY=xxxx
# Tùy chọn — đồng bộ Google Calendar:
NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/google/callback
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# 4. Chạy:
bun run dev
```

### Biến môi trường

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `MONGODB_URI` | Có | Chuỗi kết nối MongoDB |
| `GEMINI_API_KEY` | Không* | Key Google Gemini cho nhập liệu AI & LMS (thay thế: `GOOGLE_GEMINI_API_KEY` / `NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY`; `GEMINI_MODEL` để chọn model) |
| `NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED` | Không | Bật tính năng đồng bộ Google Calendar |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Không | OAuth client Google (chỉ khi bật Google Calendar) |
| `GOOGLE_REDIRECT_URI` / `NEXT_PUBLIC_APP_URL` | Không | Redirect URI và URL ứng dụng cho OAuth |

\* Chỉ bắt buộc khi dùng tính năng nhập liệu AI hoặc deadline LMS.

### Scripts (đều dùng Bun)

| Script | Lệnh |
|---|---|
| dev | `node node_modules/next/dist/bin/next dev -p 3005` |
| build | `node node_modules/next/dist/bin/next build` |
| start | `node node_modules/next/dist/bin/next start -p 3005` |
| typecheck | `node node_modules/typescript/bin/tsc --noEmit` |
| test | `bun test` (Bun's built-in test runner) |

## Tính năng

- **Đăng nhập**:
  - SSO HCMUT (CAS qua mybk),
  - Tài khoản cục bộ (đăng ký tại `/signup`, không cần SSO) — màn hình đăng nhập hỏi khi tên đăng nhập không giống tài khoản mybk và **ghi nhớ lựa chọn** cho lần sau,
  - Cache offline khi mybk gặp sự cố.
- **Dashboard** (`/dashboard`): lớp học hôm nay, đếm ngược lịch thi, deadline nhóm, deadline LMS, bảng my-tasks.
- **Thời khóa biểu tuần** (`/schedule`): lưới Thứ 2 - Chủ Nhật × 06:00-22:00 với chi tiết môn học khi hover; xem theo ngày tại `/day`; bộ lọc môn học (thêm/ẩn); chế độ sáng/tối.
- **Lịch thi** (`/exam`).
- **Nhập liệu bằng AI**: chụp màn hình thời khóa biểu/lịch thi → Gemini tạo dữ liệu (hàng đợi nhiều ảnh, tối đa 10); tự động dọn các mục đã hết hạn.
- **Deadline LMS**: dán văn bản hoặc tải ảnh → Gemini phân tích deadline (fallback regex) → thêm/xóa trên dashboard.
- **Xuất dữ liệu** (`/export`):
  - Xuất CSV,
  - Tải `.ics` cho Apple Calendar / Outlook,
  - **Webcal subscription URL**: `webcal://{host}/api/calendar/{mssv}.ics` (tự cập nhật từ cache server),
  - **Đồng bộ Google Calendar OAuth** (tùy chọn, xem bên dưới).
- **Nhóm học tập (BTL)** (`/groups`):
  - Tạo nhóm, mời thành viên bằng email `@hcmut.edu.vn` **hoặc tên đăng nhập** (bao gồm tài khoản cục bộ),
  - **Tìm lịch rảnh chung** (so sánh thời khóa biểu của mọi thành viên, cửa sổ mặc định 07:00-21:00, tối thiểu 30 phút),
  - Quản lý nhiệm vụ & deadline với thanh tiến độ,
  - Deadline tự động tạo tệp `.ics` mời tất cả thành viên, và đẩy lên Google Calendar khi được bật.

## Đồng bộ Google Calendar (tùy chọn)

Luồng OAuth chỉ bật khi `NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED=true` và có `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

1. Tạo project tại https://console.cloud.google.com, bật **Google Calendar API**.
2. Tạo **OAuth client (Web)**, cấp quyền `https://www.googleapis.com/auth/calendar.events`, đặt redirect URI là `{APP_URL}/api/google/callback`.
3. Đặt các biến môi trường ở trên. Người dùng bấm "Kết nối Google Calendar" trên `/export` để ủy quyền.

Hành vi khi bật:
- Lớp học → sự kiện lặp lại (`RRULE` hàng tuần + `EXDATE` cho các tuần nghỉ giữa kỳ), nhắc trước 30 phút.
- Lịch thi → sự kiện một lần, nhắc qua email trước 1 ngày.
- Deadline nhóm → lời mời sự kiện tới tất cả thành viên (đẩy qua tài khoản của trưởng nhóm).

## Triển khai Vercel

- Đặt `BUN_VERSION=1.3.x` trong project settings để cài đặt dùng `bun install`.
- Runtime Vercel luôn là Node — hành vi production tương đương bản build Node.

## LƯU Ý

> Ứng dụng web này chỉ dành cho mục đích giáo dục.
>
> Không sử dụng ứng dụng web này cho bất kỳ hoạt động bất hợp pháp nào.
>
> Vui lòng kiểm tra lại với nguồn trên mybk.hcmut.edu.vn/app trước khi sử dụng lịch từ ứng dụng web này.