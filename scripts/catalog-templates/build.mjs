// Run with the bundled Spreadsheets Node runtime. See README.md in this directory.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const definitions = JSON.parse(await fs.readFile(path.join(root, 'src/lib/catalog-import-columns.json'), 'utf8'));
const outputDir = path.join(root, 'outputs/catalog-import');
const assets = path.join(root, 'public/templates');
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(assets, { recursive: true });
const navy = '#27364B', rose = '#D95070', ink = '#253348', muted = '#66758A';
const col = (i) => String.fromCharCode(65 + i);

for (const kind of ['products', 'stock']) {
  const workbook = Workbook.create();
  const columns = definitions[kind];
  const isProduct = kind === 'products';
  const sheet = workbook.worksheets.add(isProduct ? 'San pham' : 'Ton dau ky');
  const guide = workbook.worksheets.add('Huong dan');
  const end = col(columns.length - 1);
  sheet.showGridLines = false;
  sheet.tabColor = rose;
  sheet.getRange(`A1:${end}206`).format = { font: { name: 'Arial', size: 11, color: ink }, verticalAlignment: 'center', rowHeight: 27 };
  sheet.getRange('A2:H2').merge();
  sheet.getRange('A2').values = [[isProduct ? 'MẪU NHẬP SẢN PHẨM' : 'MẪU NHẬP TỒN ĐẦU KỲ']];
  sheet.getRange('A2:H2').format = { font: { name: 'Arial', size: 16, bold: true, color: navy }, rowHeight: 34, borders: { bottom: { style: 'medium', color: rose } } };
  const instructions = [
    'Điền từ dòng 7. Cột có dấu * và nền vàng nhạt là bắt buộc. Giữ nguyên hàng tiêu đề.',
    isProduct ? 'Mỗi dòng là một biến thể. Dùng chung mã sản phẩm để gộp các dung tích hoặc kích cỡ.' : 'Nhập sản phẩm trước. Sau khi tải file lên, kiểm tra phiếu nhập nháp rồi bấm Ghi sổ.',
    'Xem sheet Huong dan để tra cách điền và ví dụ. Lưu file .xlsx rồi tải lên đúng mục trên website.',
  ];
  instructions.forEach((text, i) => {
    sheet.getRange(`A${i + 3}:H${i + 3}`).merge();
    sheet.getRange(`A${i + 3}`).values = [[text]];
    sheet.getRange(`A${i + 3}:H${i + 3}`).format.font = { name: 'Arial', size: 11, color: muted };
  });
  sheet.getRange(`A6:${end}6`).values = [columns.map((c) => `${c.label}${c.required ? ' *' : ''}\n${c.key}`)];
  sheet.getRange(`A6:${end}6`).format = { fill: navy, font: { name: 'Arial', size: 11, bold: true, color: '#FFFFFF' }, wrapText: true, horizontalAlignment: 'center', rowHeight: 49 };
  const table = sheet.tables.add(`A6:${end}206`, true, isProduct ? 'ProductInput' : 'OpeningStockInput');
  table.showFilterButton = true;
  // Deliberately blank input rows; all examples live in the guide.
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    const cells = sheet.getRange(`${col(i)}7:${col(i)}206`);
    sheet.getRange(`${col(i)}1:${col(i)}206`).format.columnWidth = c.width;
    cells.format.fill = c.required ? '#FFF8E6' : '#F3F6FA';
    cells.setNumberFormat(c.type === 'date' ? 'dd/mm/yyyy' : ['money', 'whole', 'positive'].includes(c.type) ? '#,##0' : '@');
    cells.format.horizontalAlignment = ['date', 'money', 'whole', 'positive'].includes(c.type) ? 'right' : 'left';
    if (['money', 'whole', 'positive'].includes(c.type)) cells.dataValidation = { rule: { type: 'whole', operator: 'between', formula1: c.type === 'positive' ? 1 : 0, formula2: 2147483647 } };
    if (c.type === 'list') cells.dataValidation = { rule: { type: 'list', values: ['SELLABLE', 'TESTER'] } };
  }
  sheet.freezePanes.freezeRows(6);
  sheet.freezePanes.freezeColumns(2);

  guide.showGridLines = false;
  guide.tabColor = '#A7B3C4';
  guide.getRange('A1:E40').format = { font: { name: 'Arial', size: 11, color: ink }, verticalAlignment: 'center', rowHeight: 30 };
  for (const [c, width] of [['A', 25], ['B', 24], ['C', 16], ['D', 74], ['E', 35]]) guide.getRange(`${c}1:${c}40`).format.columnWidth = width;
  guide.getRange('A2:E2').merge();
  guide.getRange('A2').values = [['HƯỚNG DẪN ĐIỀN FILE']];
  guide.getRange('A2:E2').format = { font: { name: 'Arial', size: 16, bold: true, color: navy }, rowHeight: 34, borders: { bottom: { style: 'medium', color: rose } } };
  const notes = [
    `Chỉ dữ liệu trong sheet ${sheet.name} được nhập. Sheet này dùng để tham khảo.`,
    'Ví dụ dưới đây chỉ minh họa cách điền. Hãy dùng mã danh mục và mã kho thực tế của bạn.',
    isProduct ? 'Thông tin chung của các dòng cùng mã sản phẩm phải thống nhất. SKU mỗi biến thể là duy nhất.' : 'Ngày dùng định dạng dd/mm/yyyy. Một dòng tương ứng một SKU, một lô, một kho và một loại hàng.',
    isProduct ? 'Với sản phẩm đã có, nhập đủ các biến thể đang dùng. Ô nội dung bỏ trống có thể xóa nội dung cũ.' : 'Không tải lại cùng dữ liệu tồn đã ghi sổ, vì có thể làm tăng tồn kho hai lần.',
  ];
  notes.forEach((text, i) => { guide.getRange(`A${i + 3}:E${i + 3}`).merge(); guide.getRange(`A${i + 3}`).values = [[text]]; guide.getRange(`A${i + 3}:E${i + 3}`).format.font = { name: 'Arial', size: 11, color: muted }; });
  guide.getRange('A8:E8').values = [['Cột trên mẫu', 'Mã cột', 'Yêu cầu', 'Cách điền', 'Ví dụ tham khảo']];
  guide.getRange('A8:E8').format = { fill: navy, font: { name: 'Arial', size: 11, color: '#FFFFFF', bold: true }, rowHeight: 30, horizontalAlignment: 'center' };
  guide.getRange(`A9:E${8 + columns.length}`).values = columns.map((c) => [c.label, c.key, c.required ? 'Bắt buộc' : 'Tùy chọn', c.hint, c.type === 'date' ? new Date(`${c.example}T00:00:00Z`) : c.example]);
  guide.getRange(`A9:E${8 + columns.length}`).format = { wrapText: true, rowHeight: 46 };
  guide.getRange(`C9:C${8 + columns.length}`).format.font = { name: 'Arial', size: 11, color: '#9C6514' };
  for (let i = 0; i < columns.length; i++) {
    if (i % 2 === 0) guide.getRange(`A${9 + i}:E${9 + i}`).format.fill = '#F3F6FA';
    if (columns[i].type === 'date') guide.getRange(`E${9 + i}`).setNumberFormat('dd/mm/yyyy');
    else if (typeof columns[i].example === 'number') guide.getRange(`E${9 + i}`).setNumberFormat('#,##0');
  }
  guide.freezePanes.freezeRows(8);
  workbook.recalculate();
  for (const [name, range, imageName] of [[sheet.name, isProduct ? 'A1:H14' : 'A1:H14', `${kind}-preview`], ['Huong dan', `A1:E${8 + columns.length}`, `${kind}-guide`]]) {
    const preview = await workbook.render({ sheetName: name, range, scale: 1.5, format: 'png' });
    await fs.writeFile(path.join(outputDir, `${imageName}.png`), new Uint8Array(await preview.arrayBuffer()));
  }
  const file = await SpreadsheetFile.exportXlsx(workbook);
  await file.save(path.join(outputDir, `${kind}.xlsx`));
  await fs.copyFile(path.join(outputDir, `${kind}.xlsx`), path.join(assets, `${kind}.xlsx`));
  console.log(`${kind}.xlsx: ${columns.length} columns, 200 blank entry rows, 2 sheets`);
}
