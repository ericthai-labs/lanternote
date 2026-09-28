# Lanternote — ghi chú Markdown cho thư mục rất lớn (desktop)

© 2026 Eric Thai - Thai Ba Hoa. Giấy phép **PolyForm Noncommercial 1.0.0** — xem `LICENSE.txt`: dùng miễn phí cho cá nhân
và tổ chức phi lợi nhuận; dùng thương mại (kể cả doanh nghiệp dùng nội bộ) phải xin phép tác giả. Thư viện mã nguồn mở đi kèm: `THIRD-PARTY-NOTICES.txt`
(tự sinh bởi `scripts/notices.js`, phải đi kèm mọi bản phân phối).

App desktop độc lập, **không liên quan tới dashboard** (`index.html` / `classic.html`, `APP_REV`).
Mở một thư mục ghi chú `.md` và đọc, sửa, tìm, vẽ đồ thị.
Không gửi dữ liệu đi đâu: mọi thứ đọc từ ổ đĩa máy mình, thư viện đóng gói sẵn, chạy không cần mạng.

## Dùng

- **Windows:** tải `Lanternote-x.y.z-portable.exe` (GitHub → Actions → "Lanternote (desktop build)"
  → Artifacts), chạy trực tiếp, không cần cài, không cần quyền admin.
- Lần đầu: **Open a folder** → chọn thư mục vault. Lần sau app tự mở lại thư mục + ghi chú cuối.
- Sửa file bằng app khác / VS Code / OneDrive đồng bộ → app tự nạp lại trong ~1 giây.

| Phím | Việc |
|---|---|
| Ctrl+O hoặc Ctrl+K | Mở nhanh ghi chú theo tên (gõ tắt, ví dụ `adp26` → "Audit plan 2026") |
| Ctrl+Shift+F | Tìm trong toàn bộ nội dung; `tag:#audit` để lọc theo tag |
| Ctrl+G / Ctrl+Shift+G | Đồ thị toàn bộ ghi chú / đồ thị quanh ghi chú đang mở |
| Alt+← / Alt+→ | Lùi / tiến |
| Ctrl+\\ / Ctrl+Shift+\\ | Ẩn/hiện cột file / cột outline–backlinks |
| Ctrl+Shift+D | Sáng / tối |
| Ctrl+P | In / lưu PDF ghi chú đang mở |
| Ctrl+R | Nạp lại thư mục |

## Cú pháp Markdown hỗ trợ (wiki link, nhúng, callout, front matter…)

`[[Ghi chú]]`, `[[Ghi chú|tên hiển thị]]`, `[[Ghi chú#Mục]]`, `[[Ghi chú#^block]]`; nhúng
`![[Ghi chú]]`, `![[Ghi chú#Mục]]`, `![[ảnh.png|300]]`, audio/video; link Markdown thường
`[x](thu%20muc/file.md)`; front matter (hiện thành bảng Properties); `#tag` và `#tag/con`;
callout `> [!warning]`, `> [!tip]-` (gập được); `==highlight==`; `%%comment%%` (ẩn);
task list; bảng; sơ đồ ` ```mermaid `. Backlinks, outgoing links, outline ở cột phải.

**Graph view** (nút ⚹), hai engine (ô *Engine*):
- **Map (any PC)** — mặc định. Bố cục tính một lần ở nền (Pivot MDS + làm mượt theo hàng xóm,
  `layout-worker.js`), lưu cache; vẽ bằng Canvas 2D theo mức chi tiết như bản đồ số: xa thì một ảnh
  mật độ + tên thư mục, gần thì từng ghi chú/link trong khung nhìn. Không cần card đồ hoạ, đứng yên
  không tốn CPU. Kéo/zoom chỉ dịch ảnh chụp khung trước, dừng tay mới vẽ lại nét.
- **Live (GPU)** — cosmos.gl, bố cục chuyển động; cần card đồ hoạ thật.

 "All notes" vẽ toàn bộ vault — màu theo thư mục cấp 1, cỡ theo số link;
"This note" vẽ các ghi chú quanh ghi chú đang mở (độ sâu 1–3, tối đa 3.000 nút). Bấm một nút để
mở ghi chú; ô "Highlight notes by name" tô sáng + zoom tới các ghi chú khớp; bấm tên thư mục ở
chú giải để tô sáng cả thư mục. Tìm/zoom sẽ tạm dừng bố cục (bấm Resume để chạy tiếp).
**Hub links** (mặc định "hide above 1,000"): không vẽ link của các ghi chú có hơn 1.000 link — một
ghi chú kiểu `CAGE FAPE3` (72.404 backlink) làm bố cục GPU tụt còn ~19 FPS; bỏ link của 185 hub
này thì ~120 FPS. Nút hub vẫn hiện và vẫn to theo số link thật. Khi đồ thị lớn đang chạy bố cục,
chỉ nhãn nút đang rê chuột được vẽ; nhãn đầy đủ hiện khi bố cục dừng (Pause hoặc tự nguội).

**Soạn thảo** (1.3): `Ctrl+E` đọc ⇄ sửa (CodeMirror 6), tự lưu, hoàn tác riêng từng ghi chú
(`Ctrl+Z`/`Ctrl+Y`), gợi ý `[[` và `#`, `Ctrl+B/I/K`, `Ctrl+Enter` checkbox, dán ảnh → tự lưu tệp đính kèm.
Đổi tên/di chuyển tự sửa link; xoá vào Thùng rác; bấm link chưa có để tạo; ghi chú hằng ngày;
Command palette `Ctrl+P`; menu chuột phải trên cây thư mục. File bị sửa bên ngoài trong lúc đang sửa
→ hỏi giữ bản nào. Khôi phục phiên bản cũ (bản sao ≤ 5 phút/lần, giữ 14 ngày, nằm ngoài vault).
**Xem ảnh** (1.8): bấm ảnh trong ghi chú hoặc file ảnh trong cây thư mục → trình xem toàn màn hình
(zoom, kéo, xoay, ← → lướt ảnh, Show in folder, Open with).
**Cài đặt** `Ctrl+,`: giao diện, trình soạn thảo, vị trí ghi chú mới/ảnh, đổi tên & link, thư mục bỏ qua,
ghi chú hằng ngày (thư mục, tên, mẫu), đồ thị, khôi phục.

Chưa có: công thức toán (LaTeX), Dataview, canvas, plugin, xem trực tiếp (live preview), nhiều tab.

## Vault lớn (đã đo trên thư viện ATA: 190.522 ghi chú, 2,49 triệu link, 728 MB)

| Việc | Thời gian |
|---|---|
| Mở lần đầu (chưa có cache) | ~17–19 s |
| Mở lại (có cache) | ~1–2 s, kiểm tra thay đổi chạy nền |
| Tìm toàn văn | 20–130 ms (chỉ mục từ 50 MB, có tìm không dấu) |
| Mở nhanh (Ctrl+O) | ~25 ms |
| Dựng đồ thị toàn bộ | ~0,15 s (bố cục tiếp tục trên GPU) |
| Đồ thị khi bố cục đang chạy | ~120 FPS (RTX 5070 Ti, hub links ẩn); ~19 FPS nếu hiện tất cả |

Cách làm (tham khảo cosmos.gl/Cosmograph, sigma.js):
- **Worker index** (`indexer.js`, worker thread): đọc, phân tích link/tag, giữ bản chữ thường của mọi
  ghi chú để tìm kiếm (`Buffer.indexOf`), trả lời tìm kiếm/snippet. Cửa sổ chỉ nhận chỉ mục gọn
  (danh sách đường dẫn + mảng link `Uint32Array`), nội dung ghi chú đọc khi mở.
- **Cache trên đĩa** (`userData/index-cache/*.bin`): lưu kết quả phân tích + đồ thị đã phân giải;
  mở lại thì hiện ngay rồi mới `stat` từng file ở nền, file đổi lúc app tắt được cập nhật sau.
- **Cập nhật tăng dần**: sửa/thêm/xoá file chỉ đọc lại đúng file đó.
- **Giao diện**: cây thư mục dựng khi mở thư mục (trang 1.000 dòng), backlinks/links dạng CSR,
  danh sách dài giới hạn 500 dòng.
- **Đồ thị**: [cosmos.gl](https://github.com/cosmosgl/graph) (MIT, OpenJS Foundation) — cả bố cục
  lực lẫn vẽ đều chạy trên GPU (WebGL 2), chịu được hàng trăm nghìn nút. Nhãn vẽ trên canvas phủ,
  tránh chồng chéo. Máy không có WebGL 2 thì đồ thị báo lỗi, phần còn lại vẫn chạy.
- Giới hạn: 1.000.000 file; phần text giữ cho tìm kiếm tối đa 1,5 GB (vượt thì tìm một phần và báo).

## Phát triển

Không build trong thư mục được OneDrive/Dropbox đồng bộ (`node_modules` / `dist*` rất nặng).

```
cd lanternote
npm install        # tự copy marked / DOMPurify / mermaid vào src/vendor
npm start          # chạy thử
npm run dist:win   # build dist/Lanternote-x.y.z-portable.exe (chạy được cả trên Linux)
```

Cấu trúc: `main.js` (theo dõi thư mục, chuyển yêu cầu cho worker, giao thức `vault://` phục vụ ảnh —
chặn đường dẫn thoát ra ngoài vault), `indexer.js` (worker: đọc, cache, tìm kiếm), `preload.js`
(cầu nối IPC), `src/` (giao diện: `core.js` phân tích link dùng chung với worker, `app.js`,
`graph.js`, `style.css`).

Mỗi lần tăng `version` trong `package.json` phải thêm mục `## x.y.z` vào **`CHANGELOG.md`**
(tiếng Anh, không ghi ngày; Added / Changed / Fixed); `npm run dist:*` tự kiểm tra và dừng nếu thiếu.

Kiểm thử hiệu năng / tự động:
```
node scripts/bench-index.js "<thư mục vault>" hydraulic pump   # đo index cold/warm + tìm kiếm
node scripts/drive.js "<thư mục vault>" <kịch-bản.js> [thư-mục-ảnh]  # chạy app, điều khiển qua DevTools
```
