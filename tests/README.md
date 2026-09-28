# Kịch bản kiểm thử (chạy bằng scripts/drive.js)

Mỗi kịch bản điều khiển app qua DevTools và in `PASS` / `FAIL` từng bước.
Luôn chạy trên **vault tạm**, không chạy trên thư mục ghi chú thật (các kịch bản ghi, đổi tên, xoá file).

| Kịch bản | Vault cần có | Lệnh |
|---|---|---|
| `editing.js` (18 bước) | `Home.md` (link [[A]], [[Missing]], [md](sub/B.md), 2 task), `A.md`, `sub/B.md` (link [[A\|alias]], ![[A#A]]) | `TV=<vault> node scripts/drive.js <vault> tests/editing.js` |
| `settings.js` (7 bước) | như trên + `Archive/Old.md` | `TV=<vault> node scripts/drive.js <vault> tests/settings.js` |
| `guide-about.js` (6 bước) | có `Home.md` | `node scripts/drive.js <vault> tests/guide-about.js` |
| `image-viewer.js` (10 bước) | `Home.md` nhúng `![[sunset.png\|400]]`, `![[logo.svg]]`; thư mục `pics/` có sunset.png, small.png, logo.svg | `node scripts/drive.js <vault> tests/image-viewer.js` |
| `changelog.js` (4 bước) | có `Home.md` | `node scripts/drive.js <vault> tests/changelog.js` |
| `canvas.js` (17 bước) | tạo bằng `node tests/make-canvas-vault.js <thư mục trống>` | `TV=<vault> node scripts/drive.js <vault> tests/canvas.js` |
| `dataview.js` (15 bước) | tạo bằng `node tests/make-dv-vault.js <thư mục trống>` | `TV=<vault> node scripts/drive.js <vault> tests/dataview.js` |
| `kanban.js` (25 bước) | tạo bằng `node tests/make-kanban-vault.js <thư mục trống>` | `TV=<vault> node scripts/drive.js <vault> tests/kanban.js` |
| `mcp.js` (33 bước, không cần drive.js) | tự tạo vault tạm + thư mục cài đặt tạm | `node tests/mcp.js` · bản exe: `MCP_CMD='["<win-unpacked>/Lanternote.exe","<win-unpacked>/resources/app.asar/mcp/lanternote-mcp.js"]' MCP_ENV='{"ELECTRON_RUN_AS_NODE":"1"}' node tests/mcp.js` |
| `tasks-calendar.js` (19 bước) | tạo bằng `node tests/make-task-vault.js <thư mục trống>` | `TV=<vault> node scripts/drive.js <vault> tests/tasks-calendar.js` |
| `command-center.js` (42 bước) | tạo bằng `node tests/make-cc-vault.js <thư mục trống>` | `TV=<vault> node scripts/drive.js <vault> tests/command-center.js` |
| `indexer-recovery.js` (4 bước) | vault của `make-dv-vault.js` | `LANTERNOTE_TEST=1 TV=<vault> node scripts/drive.js <vault> tests/indexer-recovery.js` |
| `undo-redo.js` (5 bước) | có `Home.md` | `node scripts/drive.js <vault> tests/undo-redo.js` |
| `map-weak-pc.js` | thư viện lớn (chỉ đọc, không ghi) | `WEAK=1 node scripts/drive.js <thư mục> tests/map-weak-pc.js` |

Thêm `APP_EXE="dist-x.y.z/win-unpacked/Lanternote.exe"` để thử bản đã đóng gói.
