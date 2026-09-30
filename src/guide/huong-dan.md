# Hướng dẫn sử dụng Lanternote

Lanternote đọc và sửa một **thư mục ghi chú Markdown** (`.md`) ngay trên máy của bạn. Không cần mạng, không gửi dữ liệu đi đâu. Ứng dụng được làm để chạy mượt cả với thư mục rất lớn (đã thử với khoảng 190.000 ghi chú).

> [!tip] Mở lại hướng dẫn này bất cứ lúc nào
> Nhấn **F1**, hoặc menu **Help → User guide**, hoặc gõ "guide" trong Command palette (**Ctrl+P**).

## 1. Bắt đầu

1. Chạy `Lanternote.exe` (bản portable không cần cài đặt, không cần quyền quản trị).
2. Bấm **Open a folder** và chọn thư mục ghi chú. Lần sau ứng dụng tự mở lại thư mục và ghi chú cuối cùng.
3. Lần đầu mở một thư mục lớn, ứng dụng đọc toàn bộ ghi chú (thư mục ~190.000 ghi chú mất khoảng 15–20 giây). Những lần sau chỉ mất 1–2 giây vì đã có bộ nhớ đệm.

Màn hình gồm ba cột:

| Cột | Nội dung |
|---|---|
| Trái | **Files** (cây thư mục), **Search** (tìm kiếm), **Tags** |
| Giữa | Ghi chú đang mở (đọc hoặc sửa), đồ thị, hoặc Command Center |
| Phải | **Outline** (mục lục của ghi chú), **Backlinks** (ghi chú nào trỏ tới đây), **Outgoing links** |

Ẩn/hiện cột trái: **Ctrl+\\** · cột phải: **Ctrl+Shift+\\**. Đổi sáng/tối: **Ctrl+Shift+D** hoặc nút ◐.

## 2. Đọc ghi chú

- Bấm một liên kết `[[Tên ghi chú]]` để mở ghi chú đó. **Alt+←** / **Alt+→** để lùi / tiến.
- Liên kết màu nhạt là ghi chú **chưa tồn tại** — bấm vào để tạo mới.
- Các cú pháp Markdown mở rộng đều hiển thị được: `[[Ghi chú#Mục]]`, `![[Ghi chú]]` (nhúng), `![[ảnh.png]]`, `#tag`, callout `> [!warning]`, `==tô sáng==`, `%%ghi chú ẩn%%`, bảng, danh sách việc, sơ đồ ` ```mermaid `, và phần thuộc tính (front matter) ở đầu ghi chú.
- **Checkbox** trong danh sách việc bấm được ngay ở chế độ đọc — thay đổi được ghi vào file.
- **Show in folder** ở đầu ghi chú mở vị trí file trong File Explorer.

### Xem ảnh

- **Bấm vào một ảnh trong ghi chú** để mở trình xem toàn màn hình; **←** / **→** chuyển qua các ảnh khác trong cùng ghi chú.
- File ảnh (PNG, JPG, GIF, WebP, SVG, BMP, AVIF, ICO) hiện trong cây thư mục và Quick open với biểu tượng 🖼 — bấm để xem; **←** / **→** chuyển qua các ảnh cùng thư mục. (Tắt được trong Cài đặt → Files & links.)
- **Ảnh từ Internet** (địa chỉ `http://…`, `https://…` trong ghi chú) **không tự tải**: hiện một ô *"Picture from … · click to load"*, bấm vào mới tải đúng ảnh đó. Lý do: tải ảnh là báo cho máy chủ web biết bạn vừa mở ghi chú, lúc mấy giờ. Muốn luôn tải: **Settings → Files & links → Load pictures from the internet**.
- **Cuộn chuột** để phóng to/thu nhỏ tại vị trí con trỏ, **kéo** để di chuyển, **bấm đúp** để chuyển giữa vừa màn hình và kích thước thật.
- Phím: **+** / **−** phóng, **0** vừa màn hình, **1** kích thước thật, **R** xoay, **Esc** đóng.
- Thanh trên cùng cho biết kích thước (điểm ảnh), dung lượng, và có nút **Show in folder**, **Open with…** (mở bằng ứng dụng mặc định của Windows).

## 3. Tìm kiếm

| Việc | Cách làm |
|---|---|
| Mở nhanh theo tên | **Ctrl+O** (hoặc **Ctrl+K**), gõ tắt được: `adp26` → "Audit plan 2026" |
| Tìm trong nội dung mọi ghi chú | **Ctrl+Shift+F**, gõ từ cần tìm |
| Lọc theo tag | gõ `tag:#audit` trong ô tìm kiếm, hoặc bấm tag trong cột Tags |

Mẹo tìm kiếm:

- **Tìm không dấu**: gõ `tau bay` vẫn ra "tàu bay".
- Tìm theo **từ và đầu từ**: `pump` ra cả "pumps", "pumping".
- **Mã tài liệu** tìm được theo từng đoạn: `29-11`, `801-a` đều ra "AMM 29-11-00-710-801-A".
- Nhiều từ = ghi chú phải chứa **tất cả** các từ đó.
- Không tìm được đoạn chữ nằm *giữa* một từ (gõ `draulic` sẽ không ra "hydraulic").

## 4. Soạn thảo

Nhấn **Ctrl+E** (hoặc nút ✎) để chuyển giữa **đọc** và **sửa**.

- **Tự lưu**: khoảng 0,8 giây sau khi ngừng gõ, khi chuyển sang ghi chú khác và khi đóng cửa sổ. Trạng thái hiện ở đầu ghi chú: *Editing… → Saving… → Saved*.
- **Đổi tên**: sửa ngay tiêu đề lớn ở đầu ghi chú rồi nhấn Enter.
- **Hoàn tác / làm lại**: nút **↶ Undo** / **↷ Redo** trên thanh soạn thảo, hoặc **Ctrl+Z** / **Ctrl+Y**. Mỗi ghi chú có lịch sử hoàn tác riêng.
- **Gợi ý liên kết**: gõ `[[` rồi vài chữ → chọn ghi chú bằng ↑↓ và Enter. Gõ `[[Ghi chú#` để chọn một tiêu đề trong ghi chú đó.
- **Gợi ý tag**: gõ `#` rồi vài chữ.
- **Dán ảnh** (Ctrl+V) hoặc kéo thả file vào → ảnh được lưu thành file đính kèm và chèn `![[...]]`.

| Phím | Tác dụng |
|---|---|
| Ctrl+B / Ctrl+I | **Đậm** / *nghiêng* |
| Ctrl+K | Biến chữ đang chọn thành `[[liên kết]]` |
| Ctrl+Enter | Tạo / đánh dấu việc cần làm `- [ ]` ⇄ `- [x]` |
| Ctrl+F | Tìm / thay thế trong ghi chú đang sửa |
| Tab / Shift+Tab | Thụt / bỏ thụt dòng |

### Live preview (xem trước khi sửa)

Khi sửa, các ký hiệu Markdown (`**`, `#`, `>`, `[[ ]]`, địa chỉ link…) được **ẩn đi ở mọi chỗ trừ chỗ có con trỏ**: tiêu đề hiện chữ lớn, việc cần làm hiện ô tick (bấm để tick), ảnh hiện ngay trong ghi chú, link bấm được. Đưa con trỏ vào một link hay chữ đậm thì ký hiệu hiện lại để sửa. File vẫn là Markdown thuần — không có gì thêm vào.

- **Bấm** link: mở ghi chú · **Ctrl+bấm**: mở ở tab mới · **Alt+bấm**: mở ở khung bên phải.
- Tắt / bật: **Cài đặt → Editor → Live preview**, hoặc Ctrl+P → *Toggle live preview*.

> [!warning] Khi file bị sửa ở nơi khác
> Nếu trong lúc bạn đang sửa, file bị thay đổi bởi OneDrive, một ứng dụng khác hay người khác, Lanternote **không ghi đè** mà hiện thông báo: chọn **Keep my version** (giữ bản của bạn) hoặc **Load the other version** (lấy bản kia). Nếu bạn chưa gõ gì, bản mới được nạp tự động.

## 4b. Nhiều tab và chia khung

**Tab** — mở nhiều ghi chú cùng lúc, thanh tab nằm trên vùng ghi chú. Mỗi tab có lịch sử Lùi / Tiến riêng; danh sách tab của mỗi thư mục được nhớ cho lần mở sau.

| Cách | Tác dụng |
|---|---|
| Ctrl+T hoặc nút **+** | Tab mới (chọn ghi chú để mở) |
| Ctrl+W, nút **×**, hoặc bấm chuột giữa vào tab | Đóng tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Sang tab sau / trước |
| Ctrl+bấm hoặc bấm chuột giữa vào link, file | Mở ở tab mới |
| Kéo tab | Đổi thứ tự |

**Khung bên phải** — đọc một ghi chú trong khi viết ghi chú khác.

- Mở: **Alt+bấm** một link, chuột phải vào file → **Open in the right pane**, hoặc **Ctrl+Alt+→** (mở ghi chú đang xem).
- Khung phải có **tab và lịch sử riêng**; link bấm trong khung phải mở ngay trong khung đó.
- Nút trên khung: **‹** lùi · **✎** đọc ⇄ sửa · **⇤** mở ghi chú này ở khung chính · **✕** đóng khung.
- Sửa ở khung phải cũng **tự lưu**, cũng **không ghi đè** khi file bị đổi ở nơi khác (hiện lựa chọn như khung chính). Cùng một ghi chú mở ở cả hai khung: sửa bên này thì bên kia tự cập nhật.
- Kéo **đường chia** giữa hai khung để đổi độ rộng.

## 5. Quản lý ghi chú và thư mục

- **Ghi chú mới**: **Ctrl+N**. Vị trí mặc định là thư mục của ghi chú đang mở (đổi trong Cài đặt).
- **Menu chuột phải** trên cây thư mục, kết quả tìm kiếm hoặc backlinks: mở, sửa, tạo ghi chú mới, **đổi tên**, **di chuyển sang thư mục khác**, hiện trong Explorer, **xoá**.
- **Đổi tên / di chuyển** tự cập nhật mọi liên kết `[[...]]` và `[...](...)` đang trỏ tới ghi chú đó (có thể tắt trong Cài đặt).
- **Xoá** chỉ chuyển vào **Thùng rác** của Windows — lấy lại được.
- **Ghi chú hằng ngày**: Command palette → *Open today's daily note*. Thư mục, cách đặt tên và nội dung mẫu chỉnh trong Cài đặt → Daily notes.
- Thư mục mới chỉ hiện trên cây khi đã có ít nhất một ghi chú bên trong.

## 6. Canvas

Canvas là một bảng trắng vô hạn để sắp xếp **thẻ** và nối chúng bằng **mũi tên** — dùng file `.canvas` theo chuẩn mở JSON Canvas, **mở được trong các ứng dụng khác hỗ trợ chuẩn này** và ngược lại.

- **Tạo**: menu File → *New canvas*, Command palette, hoặc chuột phải trên cây thư mục → *New canvas here*. Canvas hiện trong cây thư mục với biểu tượng 🧩.
- **Loại thẻ**: *Card* (chữ Markdown), *Note / file* (hiện nội dung ghi chú, ảnh hoặc tên file), *Link* (trang web), *Group* (khung nhóm các thẻ).
- **Thêm thẻ chữ**: bấm đúp vào chỗ trống, hoặc nút **+ Card**. Bấm đúp vào thẻ để viết; bấm ra ngoài hoặc **Esc** để xong.
- **Thêm ghi chú / ảnh**: nút **+ Note / file**, gõ tên để chọn. Bấm đúp vào thẻ ghi chú để mở ghi chú đó.
- **Di chuyển**: kéo thẻ. Kéo **góc dưới phải** để đổi kích thước. Kéo khung nhóm thì các thẻ bên trong đi theo.
- **Nối**: rê chuột lên thẻ, kéo từ **chấm tròn** ở cạnh thẻ sang thẻ khác. Bấm đúp vào mũi tên để ghi nhãn.
- **Chọn nhiều**: **Shift+kéo** trên chỗ trống, hoặc **Shift+bấm** từng thẻ; **Ctrl+A** chọn tất cả. Nút **Group** tạo khung quanh các thẻ đã chọn; **Colour…** tô màu; **Delete** (hoặc phím Delete) xoá.
- **Xem**: kéo chỗ trống để di chuyển bảng, cuộn chuột để lướt, **Ctrl+cuộn** để phóng to/thu nhỏ, **Fit** (Shift+1) để xem toàn bộ.
- **Hoàn tác**: **↶ / ↷** hoặc **Ctrl+Z / Ctrl+Y**. Canvas **tự lưu** như ghi chú, và cũng có bảo vệ khi file bị sửa ở nơi khác.
- Đổi tên một ghi chú thì các canvas đang chứa thẻ của ghi chú đó cũng tự cập nhật.

## 6b. Bảng Kanban

Một ghi chú có `kanban-plugin: board` trong phần thuộc tính đầu note sẽ mở thành **bảng**: mỗi `## Tiêu đề` là một **cột**, mỗi dòng `- [ ] …` là một **thẻ**. Đây là định dạng bảng Markdown phổ biến, nên bảng tạo ở ứng dụng khác mở được ngay và ngược lại.

- Tạo bảng mới: menu **File → New kanban board** (hoặc Command palette).
- **Kéo thả** thẻ giữa các cột và trong một cột; kéo tiêu đề cột để đổi thứ tự cột.
- **+ Add a card** (Enter để thêm tiếp, Esc để dừng); **bấm đúp** thẻ để sửa (Shift+Enter xuống dòng); ✕ để xoá; ô vuông để đánh dấu xong.
- Nút **⋯** của cột: đổi tên, đánh dấu cột **Complete** (thẻ thả vào tự thành xong), sắp theo hạn, xoá thẻ đã xong, xoá cột.
- Hạn trong thẻ `📅 2026-10-01` (hoặc `@{2026-10-01}`): gần hạn màu cam, trễ hạn màu đỏ.
- Ô **Filter cards** lọc thẻ theo chữ; **Ctrl+Z / Ctrl+Y** hoàn tác.
- **Markdown** (hoặc Ctrl+E) xem/sửa dạng chữ; **Board view** để quay lại bảng.
- Thẻ cũng là dòng việc, nên truy vấn `TASK`, Command Center và AI đều thấy.

## 7. Truy vấn Dataview và mẫu ghi chú

**Truy vấn Dataview** — các khối ` ```dataview ` viết theo ngôn ngữ truy vấn Dataview chạy luôn trong Lanternote, hiện thành bảng, danh sách, danh sách việc hoặc lịch tháng, **tự cập nhật** khi ghi chú thay đổi.

- Hỗ trợ: `TABLE`, `TABLE WITHOUT ID`, `LIST`, `TASK`, `CALENDAR`, `FROM "thư mục"` (nối bằng `OR` / `AND`, loại trừ bằng `-`), `FROM #tag`, `FROM [[ghi chú]]`, `WHERE`, `SORT … ASC/DESC`, `GROUP BY`, `FLATTEN`, `LIMIT`.
- Trường: thuộc tính đầu ghi chú (front matter), trường viết trong bài `khoa:: giá trị`, và `file.name`, `file.link`, `file.folder`, `file.mtime`, `file.ctime`, `file.tags`, `file.inlinks`, `file.outlinks`, `this.…`, `row["tên-có-gạch"]`.
- Hàm thường dùng: `date(today)`, `dur(7 days)`, `dateformat(ngay, "dd/MM/yyyy")`, `choice`, `contains`, `startswith`, `regexmatch`, `length`, `round`, `default`, `join`…
- Chưa hỗ trợ: `dataviewjs` (mã JavaScript) và hàm có mũi tên (`filter(x => …)`).

**Truy vấn việc — `TASK`**: liệt kê các dòng việc `- [ ] …` trong ghi chú, gom theo ghi chú (hoặc theo `GROUP BY`).

~~~
TASK FROM "03-Du-An" WHERE !completed AND due <= date(today) + dur(7 days) SORT due ASC
~~~

| Trường của việc | Ý nghĩa |
|---|---|
| `text`, `status` | nội dung; ký tự trong ngoặc: `" "` chưa làm, `"x"` xong, `"-"` huỷ… |
| `completed` / `checked` | đã xong (`x`) / đã đánh dấu bất kỳ (khác trống) |
| `fullyCompleted` | xong cả việc con |
| `due`, `scheduled`, `start`, `completion`, `created` | ngày ghi trong dòng việc: `📅 2026-10-01`, `⏳ …`, `🛫 …`, `✅ …`, `➕ …` hoặc `[due:: 2026-10-01]` |
| `tags`, `outlinks`, `children`, `line`, `path`, `file.…` | tag, liên kết trong dòng việc, việc con, số dòng, ghi chú chứa việc |

Việc cũng dùng được các trường của ghi chú chứa nó (ví dụ `GROUP BY owner`), trừ các ngày ở trên (ngày chỉ lấy từ chính dòng việc). `file.tasks` cho biết các việc của một ghi chú (ví dụ `TABLE length(file.tasks)`).

**Đánh dấu việc ngay trong kết quả**: bấm ô vuông cạnh một việc (trong ghi chú hay trên Command Center) là ghi `[x]` / `[ ]` vào đúng dòng đó trong file. Nếu dòng đã bị sửa ở nơi khác, ứng dụng không ghi mà làm mới danh sách.

**Lịch — `CALENDAR`**: một tháng, mỗi ghi chú là một chấm trên ngày của nó.

~~~
CALENDAR file.day FROM "Nhat-ky"
CALENDAR han_chot FROM "03-Du-An"
CALENDAR file.mday
~~~

‹ › đổi tháng, **Today** về tháng này; bấm một ngày có chấm để xem danh sách ghi chú của ngày đó. `file.day` là ngày trong tên file (`2026-09-27.md`), `file.mday` là ngày sửa.
- Ngày trong kết quả hiện theo kiểu mặc định của Dataview ("October 01, 2026"); đổi trong Cài đặt → Dataview (ví dụ `dd/MM/yyyy`).

**Mẫu ghi chú** — đặt các ghi chú mẫu trong một thư mục (ứng dụng tự nhận `99-Templates`, `Templates`…; đổi trong Cài đặt → Templates).

- **Alt+E** (hoặc Command palette → *Insert template*): chọn mẫu, nội dung được chèn tại con trỏ.
- *New note from template…* (menu File): tạo ghi chú mới từ một mẫu.
- Điền sẵn: `<% tp.file.title %>`, `<% tp.date.now("DD/MM/YYYY") %>`, `<% tp.date.now() %>`, `{{title}}`, `{{date}}`, `{{time}}`, `{{date:DD/MM/YYYY}}`. Lệnh Templater khác được giữ nguyên và có thông báo.
- Mẫu cho ghi chú hằng ngày (Cài đặt → Daily notes) cũng dùng được các cú pháp trên.

## 8. Khôi phục phiên bản cũ

Mỗi khi một ghi chú bị ghi đè, bản trước đó được giữ lại (tối đa một bản mỗi 5 phút, giữ 14 ngày). Các bản này nằm trên máy của bạn, **ngoài** thư mục ghi chú, nên không bị OneDrive đồng bộ.

Bấm **🕘 Versions** trên thanh soạn thảo (hoặc Command palette → *Restore a previous version*), chọn thời điểm. Nội dung cũ được đưa vào trình soạn thảo như một lần sửa bình thường — nhấn **Undo** nếu muốn quay lại.

## 9. Đồ thị

Nhấn **Ctrl+G** (toàn bộ ghi chú) hoặc **Ctrl+Shift+G** (quanh ghi chú đang mở), hoặc nút ⚹.

- **All notes**: toàn bộ thư mục. Màu theo thư mục cấp 1, cỡ chấm theo số liên kết. Nhìn xa thấy tên các thư mục; phóng gần thấy từng ghi chú và liên kết.
- **This note**: các ghi chú quanh ghi chú đang mở, độ sâu 1–3 (ô **Depth**).
- Kéo chuột để di chuyển, cuộn chuột để phóng to/thu nhỏ, bấm đúp để phóng vào, **Fit** để xem toàn bộ.
- Rê chuột lên một chấm để thấy tên và mọi liên kết của nó; bấm để mở ghi chú.
- Ô **Highlight notes by name** tô sáng các ghi chú có tên chứa chữ bạn gõ. Bấm tên thư mục ở chú giải phía dưới để tô sáng cả thư mục.
- **Hub links**: các ghi chú có quá nhiều liên kết (ví dụ một nhà sản xuất có 72.000 part number) làm đồ thị rối và chậm; mặc định không vẽ liên kết của ghi chú có hơn 1.000 liên kết. Bản thân ghi chú đó vẫn hiện.
- **Engine**:
  - **Map (any PC)** — mặc định. Bố cục tính một lần rồi lưu lại, chạy mượt cả trên máy không có card đồ hoạ.
  - **Live (GPU)** — bố cục chuyển động liên tục; cần card đồ hoạ tốt, với thư mục lớn có thể chậm.
- Lần đầu mở đồ thị của một thư mục lớn, ứng dụng cần vài giây để sắp xếp ("Laying out the map…"); những lần sau mở ngay.

## 10. Command Center

Trang tổng quan của cả thư mục: bấm nút **⌂** trên thanh công cụ hoặc **Ctrl+Shift+H** (bấm lại để quay về ghi chú). Trang không tự mở khi khởi động.

Chưa làm gì thì trang hiện **bố cục có sẵn**: số ghi chú, liên kết, tag, số ghi chú sửa hôm nay / 7 ngày; các thư mục cấp 1 (bấm để mở thư mục đó ở cột trái); ghi chú sửa gần đây; tag dùng nhiều; và các ghi chú có trường `due` trong 14 ngày tới.

**Tự thiết kế trang**: bấm **Layout** ở thanh dưới. Ứng dụng tạo ghi chú `Command Center.md` ở gốc thư mục (đổi tên/đường dẫn trong **Settings → Command Center**) và mở ra để sửa. Đó là một ghi chú Markdown bình thường, mở bằng ứng dụng nào cũng đọc được:

- `# Left`, `# Center`, `# Right` (hoặc `# Trái`, `# Giữa`, `# Phải`) chọn cột. Không có các tiêu đề này thì thẻ xếp thành lưới.
- Tiêu đề `#` đầu tiên không phải tên cột là **tên trang** (ví dụ `# Command Center`).
- Mỗi `## Tiêu đề` là **một thẻ**. Trong thẻ viết gì cũng được: danh sách, `[[liên kết]]`, callout, và **truy vấn Dataview** (xem mục 7). Thẻ chỉ có một truy vấn sẽ hiện số dòng kết quả cạnh tiêu đề.
- Các khối ```` ```lantern ```` cho những thứ Dataview không làm được:

| Khối | Hiện gì |
|---|---|
| `stats` | Số ghi chú, liên kết, tag, sửa hôm nay, sửa trong 7 ngày |
| `recent 10` | 10 ghi chú sửa gần nhất; `recent 10 03-Du-An` chỉ trong một thư mục |
| `folders` | Các thư mục cấp 1 kèm số ghi chú; `folders 00-Inbox, 03-Du-An/build app` chỉ những thư mục ghi ra |
| `tags 12` | 12 tag dùng nhiều nhất |

Ví dụ một thẻ "Deadline gấp" theo trường `han_chot`:

~~~markdown
# Right

## Deadline gấp
```dataview
TABLE WITHOUT ID file.link AS "Dự án", han_chot AS "Hạn"
WHERE han_chot AND han_chot >= date(today) AND han_chot <= date(today) + dur(30 days)
SORT han_chot ASC
```
~~~

Trang tự cập nhật khi ghi chú thay đổi (kể cả sửa bằng ứng dụng khác hay đồng bộ OneDrive). Ô đánh dấu `- [ ]` trên trang chỉ để xem; muốn tick thì mở ghi chú.

**Thiên hà là chính thư mục ghi chú của bạn**: mỗi ngôi sao là một ghi chú.

- Mỗi thư mục là một **nhánh xoắn**, cùng màu với đồ thị. Thư mục chiếm phần lớn thư mục (ví dụ một thư viện 200.000 ghi chú) được tách thành các thư mục con để thấy từng phần.
- Ghi chú có **nhiều liên kết** nằm gần **lõi** và to hơn.
- Ghi chú **sửa trong 7 ngày** là các sao **trắng** (nhấp nháy khi nền chuyển động).
- Mỗi ghi chú luôn ở cùng một chỗ, lần sau mở vẫn thấy ở đó.

Bấm **✦ Galaxy** ở thanh dưới để khám phá (các thẻ tạm ẩn):

| Thao tác | Việc |
|---|---|
| Cuộn chuột | Phóng to / thu nhỏ quanh vị trí chuột |
| Kéo chuột | Di chuyển |
| Bấm đúp | Phóng to vào chỗ đó |
| Rê chuột lên sao | Tên ghi chú và thư mục |
| Bấm vào sao | Mở ghi chú |
| Bấm tên thư mục ở chú giải | Tô sáng nhánh đó (bấm lại để bỏ) |
| Esc | Quay lại trang |

Phóng đủ gần thì tên ghi chú hiện ngay cạnh các sao.

**Nền** (**Settings → Command Center → Background**): vẽ không cần card đồ hoạ.

- **Automatic** (mặc định): sao chuyển động nhẹ; tự đổi sang ảnh tĩnh nếu máy vẽ chậm hoặc Windows đang tắt hiệu ứng động (*Settings → Accessibility → Visual effects → Animation effects*).
- **Moving stars**: luôn chuyển động (chỉ khi trang đang hiện).
- **Still picture**: vẽ một lần, nhẹ nhất.
- **Plain**: nền trơn theo giao diện sáng/tối.

## 11. Kết nối AI (MCP)

Trợ lý AI hỗ trợ **MCP** (Claude Code, Claude Desktop…) có thể làm việc với ghi chú của bạn qua Lanternote: tìm, đọc, chạy truy vấn, liệt kê việc — và nếu cho phép thì **tạo ghi chú, ghi thêm, sửa đoạn văn, tick việc, đặt thuộc tính**.

1. Mở **Settings → AI connection**.
2. Claude Code: bấm **Copy command**, dán vào terminal và chạy một lần. Claude Desktop: bấm **Copy config**, dán vào `claude_desktop_config.json` (Settings → Developer → Edit config) rồi khởi động lại Claude Desktop.
3. Hỏi AI như bình thường, ví dụ: *"Tuần này dự án nào có việc trễ hạn? Tóm tắt và ghi vào note họp sáng mai."*

- AI làm việc với **thư mục mở gần nhất** trong Lanternote.
- **Let the AI edit notes**: tắt đi thì AI chỉ đọc. **Folders the AI may use**: giới hạn thư mục AI được thấy (ví dụ `03-Du-An, 02-Bao-Cao`).
- AI có công cụ **verify_quote**: trước khi trích dẫn, kiểm câu trích và **từng con số** có đúng trong ghi chú không (ví dụ số liệu, ngày, số hiệu). Có thể dặn AI: *"kiểm lại mọi trích dẫn bằng verify_quote"*.
- Mỗi lần AI sửa, **bản cũ luôn được giữ** — mở ghi chú, bấm **🕘 Versions** để lấy lại. Danh sách thay đổi nằm ở `mcp.log` (Settings → Advanced → Open folder).
- Khi AI đọc một ghi chú, nội dung đó được gửi tới nhà cung cấp AI. Chỉ bật với thư mục bạn chấp nhận chia sẻ.
- Dùng bản giải nén (thư mục `win-unpacked` hoặc file `.zip`), không dùng bản portable `.exe` cho kết nối AI.

## 12. Command palette

**Ctrl+P** mở danh sách mọi lệnh. Gõ vài chữ để lọc (ví dụ `dark`, `daily`, `rename`), ↑↓ rồi Enter để chạy.

## 13. Cài đặt

**Ctrl+,** hoặc nút ⚙. Mọi thay đổi có hiệu lực ngay.

| Mục | Chỉnh được |
|---|---|
| Appearance | Giao diện sáng / tối / theo Windows, cỡ chữ, độ rộng dòng, font, màu nhấn |
| Editor | Ghi chú mở ở chế độ nào, thời gian chờ tự lưu, kiểm tra chính tả, tô dòng đang sửa |
| Files & links | Nơi đặt ghi chú mới và ảnh dán vào, cập nhật liên kết khi đổi tên, hỏi trước khi xoá, **thư mục bỏ qua** |
| Daily notes | Thư mục, cách đặt tên (`YYYY-MM-DD`, `ddd`…), nội dung mẫu (`{{date}}`, `{{time}}`) |
| Command Center | Ghi chú dùng làm bố cục, kiểu nền, tốc độ quay của thiên hà |
| AI connection | Cho AI sửa ghi chú hay chỉ đọc, thư mục AI được dùng, lệnh kết nối Claude |
| Graph | Engine mặc định, ngưỡng hub links |
| File recovery | Chu kỳ giữ bản sao, số ngày giữ (0 phút = tắt) |
| Advanced | Mở thư mục chứa cài đặt, đặt lại mọi cài đặt |

**Thư mục bỏ qua** (ví dụ `Archive, 99-Templates`): không đọc, không tìm, không vẽ. Có hiệu lực sau khi nạp lại thư mục (**Ctrl+R**).

## 14. Toàn bộ phím tắt

| Phím | Việc |
|---|---|
| F1 | Hướng dẫn này |
| Ctrl+O / Ctrl+K | Mở nhanh ghi chú theo tên |
| Ctrl+Shift+F | Tìm trong mọi ghi chú |
| Ctrl+N | Ghi chú mới |
| Ctrl+E | Đọc ⇄ sửa |
| Alt+E | Chèn mẫu ghi chú |
| Ctrl+P | Command palette |
| Ctrl+, | Cài đặt |
| Ctrl+Shift+H | Command Center |
| Ctrl+G / Ctrl+Shift+G | Đồ thị toàn bộ / quanh ghi chú |
| Alt+← / Alt+→ | Lùi / tiến |
| Ctrl+T / Ctrl+W | Tab mới / đóng tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Tab sau / trước |
| Ctrl+Alt+→ | Mở ghi chú đang xem ở khung phải |
| Ctrl+bấm / Alt+bấm link | Mở ở tab mới / khung bên kia |
| Ctrl+\\ / Ctrl+Shift+\\ | Ẩn/hiện cột trái / cột phải |
| Ctrl+Shift+D | Sáng / tối |
| Ctrl+R | Nạp lại thư mục |
| Ctrl+Shift+O | Mở thư mục khác |
| Esc | Đóng cửa sổ nổi / trình xem ảnh |
| ← / → (trong trình xem ảnh) | Ảnh trước / sau |

## 15. Câu hỏi thường gặp

**Dữ liệu có bị gửi lên mạng không?**
Không. Ứng dụng chỉ đọc và ghi trong thư mục bạn chọn; bộ nhớ đệm, cài đặt và bản sao khôi phục nằm trong thư mục riêng của ứng dụng trên máy bạn.

**Sửa file bằng ứng dụng khác / VS Code cùng lúc có sao không?**
Được. Lanternote tự nhận thay đổi trong khoảng 1 giây. Nếu cả hai bên cùng sửa một ghi chú, xem mục *Khi file bị sửa ở nơi khác* ở phần 4.

**Đồ thị chậm?**
Dùng engine **Map**, và để Hub links ở mức "hide above 1,000" hoặc "hide above 200".

**Phiên bản này có gì mới?**
Menu **Help → What's new** (hoặc trang About trong Cài đặt) mở nhật ký thay đổi của từng phiên bản.

**Tìm mãi không ra một từ?**
Tìm kiếm theo từ và đầu từ: hãy gõ từ đầu của từ đó. Ghi chú trong thư mục bị bỏ qua (Cài đặt → Files & links) không được tìm.

**Lỡ xoá ghi chú?**
Mở Thùng rác của Windows và khôi phục. Lỡ sửa sai nội dung: dùng **🕘 Versions**.

---

© 2026 Eric Thai - Thai Ba Hoa. Mã nguồn mở theo giấy phép Apache 2.0: ai cũng được dùng miễn phí, kể cả doanh nghiệp và dùng thương mại; được sửa và phân phối lại, miễn là giữ giấy phép và file NOTICE. Xem **Help → Licence**.
