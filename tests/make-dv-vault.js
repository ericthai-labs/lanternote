// Builds the temporary vault used by tests/dataview.js:
//   node tests/make-dv-vault.js <empty folder>
const fs = require('fs'), path = require('path');
const d = path.resolve(process.argv[2]);
fs.rmSync(d, { recursive: true, force: true });
const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text); };
const iso = (days) => { const t = new Date(); t.setDate(t.getDate() + days); return t.toISOString().slice(0, 10); };
w('03-Du-An/Alpha.md', `---\nloai: du-an\ntrang_thai: dang-lam\nuu_tien: Cao\nhan_chot: ${iso(3)}\ndoc_truoc: "[[Plan]]"\n---\n# Alpha\nnguoi:: Son\n`);
w('03-Du-An/Beta.md', `---\nloai: du-an\ntrang_thai: dang-lam\nuu_tien: Thap\nhan_chot: ${iso(30)}\n---\n# Beta\nnguoi:: Thao\n`);
w('03-Du-An/Gamma.md', `---\nloai: du-an\ntrang_thai: xong\nuu_tien: Trung-binh\n---\n# Gamma\n`);
w('03-Du-An/_Template-Du-An.md', `---\nloai: du-an\ntrang_thai: dang-lam\n---\n`);
w('02-Bao-Cao/BC-1.md', `---\nloai: bao-cao\nky: 2026-09\n---\n# BC 1\n`);
w('Plan.md', '# Plan\n');
w('99-Templates/Tpl-Meeting.md', '# <% tp.file.title %>\nDate: <% tp.date.now("DD/MM/YYYY") %>\nCore: {{date:YYYY}}\nUnknown: <% tp.system.prompt("x") %>\n');
w('Dashboard.md', [
  '# Dashboard', '',
  '```dataview', 'TABLE trang_thai AS "Trạng thái", uu_tien AS "Ưu tiên"', 'FROM "03-Du-An"', 'WHERE loai = "du-an" AND file.name != "_Template-Du-An" AND trang_thai != "xong"', 'SORT uu_tien ASC', '```', '',
  '```dataview', 'TABLE WITHOUT ID file.link AS "Dự án", choice(doc_truoc, "", "❌ doc_truoc") AS "Thiếu", doc_truoc AS "Đọc trước"', 'FROM "03-Du-An"', 'WHERE loai = "du-an" AND !startswith(file.name, "_")', 'SORT file.name ASC', '```', '',
  '```dataview', 'TABLE length(rows) AS "Số note"', 'WHERE loai', 'GROUP BY loai', 'SORT length(rows) DESC', '```', '',
  '```dataview', 'TABLE han_chot AS "Hạn chót", round((date(han_chot) - date(today)).days) AS "Còn"', 'FROM "03-Du-An"', 'WHERE han_chot AND han_chot <= date(today) + dur(7 days)', '```', '',
  '```dataview', 'LIST nguoi', 'WHERE nguoi', 'SORT file.name ASC', '```', '',
  '```dataview', 'LIST', 'WHERE file.name != this.file.name AND !loai', 'SORT file.name ASC', '```', '',
  '```dataview', 'TABLE foo(', '```', '',
].join('\n'));
console.log('dataview test vault ready:', d);
