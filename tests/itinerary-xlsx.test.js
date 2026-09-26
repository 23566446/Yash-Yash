const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
    HEADERS, normalizeRow, parseWorkbook, applyImport, mapUrlHostAllowed,
    parseGoogleMapsCoordinates, requirePreviewVersion, safeFilename, buildWorkbook
} = require('../lib/itinerary-xlsx');

const trip = { title: '台北', startDate: '2026-09-26', days: [
    { dayNumber: 1, locations: [{ name: '原地點', addr: '', lat: 25, lng: 121 }] },
    { dayNumber: 2, locations: [] }
] };

async function fileWithRows(rows, headers = HEADERS) {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('行程');
    sheet.addRow(headers);
    rows.forEach(row => sheet.addRow(row));
    return Buffer.from(await book.xlsx.writeBuffer());
}

test('template and export use the exact sheet and header contract', async () => {
    const template = buildWorkbook(trip, false);
    const exportBook = buildWorkbook(trip);
    assert.equal(template.getWorksheet('行程').rowCount, 1);
    assert.deepEqual(exportBook.getWorksheet('行程').getRow(1).values.slice(1), HEADERS);
    assert.equal(exportBook.getWorksheet('行程').getRow(2).getCell(4).value, '原地點');
    const rows = await parseWorkbook(Buffer.from(await exportBook.xlsx.writeBuffer()), trip);
    assert.equal(rows[0].name, '原地點');
    assert.equal(rows[0].mapUrl, '');
    assert.deepEqual(rows[0].errors, []);
});

test('wrong headers and formula cells are rejected', async () => {
    await assert.rejects(parseWorkbook(await fileWithRows([[1, '', '', '地點']], ['Wrong', ...HEADERS.slice(1)]), trip), /欄位/);
    const rows = await parseWorkbook(await fileWithRows([[1, '', '', { formula: '2+2', result: 4 }]]), trip);
    assert.match(rows[0].errors.join(' '), /公式/);
});

test('official template instructions before row 5 are skipped, while header order stays exact', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('行程');
    for (let i = 1; i <= 4; i++) sheet.getCell(`A${i}`).value = `填寫說明 ${i}`;
    sheet.getRow(5).values = HEADERS;
    sheet.getRow(6).values = [1, '', '09:00', '第六列地點'];
    const rows = await parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()), trip);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rowNumber, 6);
    assert.equal(rows[0].time, '09:00');
    sheet.getRow(5).getCell(2).value = 'Wrong';
    await assert.rejects(parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()), trip), /欄位/);
});

test('Excel time-formatted cells and text ranges preserve useful Time values', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('行程');
    sheet.addRow(HEADERS);
    const timeCell = sheet.addRow([1, '', 0.375, '上午地點']).getCell(3);
    timeCell.numFmt = 'hh:mm';
    sheet.addRow([1, '', '09:00-10:00', '時段地點']);
    const rows = await parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()), trip);
    assert.equal(rows[0].time, '09:00');
    assert.equal(rows[1].time, '09:00-10:00');
    assert.equal(normalizeRow([1, '', 0.375, '數字時間'], 4, trip).time, '09:00');
});

test('final import requires the exact version returned by preview', () => {
    assert.equal(requirePreviewVersion('7', 7), 7);
    assert.throws(() => requirePreviewVersion('7', 8), { status: 409 });
    assert.throws(() => requirePreviewVersion('', 7), { status: 400 });
    assert.throws(() => requirePreviewVersion('7.1', 7), { status: 400 });
});

test('Day, Title, Date and coordinate validation preserve warning distinction', () => {
    assert.match(normalizeRow([3, '', '', '地點'], 2, trip).errors.join(' '), /Day/);
    assert.match(normalizeRow([1, '', '', ''], 2, trip).errors.join(' '), /Title/);
    assert.match(normalizeRow([1, '2026-09-27', '', '地點'], 2, trip).warnings.join(' '), /Date/);
    assert.match(normalizeRow([1, '2026-02-30', '', '地點'], 2, trip).errors.join(' '), /Date/);
    assert.match(normalizeRow([1, '', '', '地點', '', '', '', 25], 2, trip).errors.join(' '), /成對/);
    assert.match(normalizeRow([1, '', '', '地點', '', '', '', 91, 121], 2, trip).errors.join(' '), /座標/);
    assert.match(normalizeRow([1, '', '', '地點', '', '', '', 25, 181], 2, trip).errors.join(' '), /座標/);
});

test('500-row limit accepts boundary and rejects the next populated row', async () => {
    assert.equal((await parseWorkbook(await fileWithRows(Array.from({ length: 500 }, () => [1, '', '', '地點'])), trip)).length, 500);
    await assert.rejects(parseWorkbook(await fileWithRows(Array.from({ length: 501 }, () => [1, '', '', '地點'])), trip), /500/);
});

test('Merge, Replace, exclusion and manually resolved locations work without mutating source', () => {
    const row = normalizeRow([1, '', '', '新地點', '地址'], 2, trip);
    const merge = applyImport(trip, [row], 'merge', { 2: { lat: 23, lng: 120 } });
    assert.deepEqual(merge[0].locations.map(loc => loc.name), ['原地點', '新地點']);
    assert.equal(merge[0].locations[1].lat, 23);
    assert.equal(trip.days[0].locations.length, 1);
    const replace = applyImport(trip, [row], 'replace');
    assert.deepEqual(replace[0].locations.map(loc => loc.name), ['新地點']);
    assert.equal(replace[0].locations[0].lat, undefined);
    assert.equal(applyImport(trip, [row], 'merge', { 2: { exclude: true } })[0].locations.length, 1);
    assert.throws(() => applyImport(trip, [row], 'merge', { 2: { lat: 200, lng: 0 } }), /定位/);
});

test('mapUrl round-trips and old rows without mapUrl remain valid', async () => {
    const url = 'https://www.google.com/maps?q=25.03,121.56';
    const source = { ...trip, days: [{ dayNumber: 1, locations: [{ name: '新地點', addr: '地址', mapUrl: url, lat: 25.03, lng: 121.56 }] }] };
    const parsed = await parseWorkbook(Buffer.from(await buildWorkbook(source).xlsx.writeBuffer()), source);
    assert.equal(parsed[0].mapUrl, url);
    assert.equal(parsed[0].lat, 25.03);
    assert.equal((await parseWorkbook(Buffer.from(await buildWorkbook(trip).xlsx.writeBuffer()), trip))[0].mapUrl, '');
});

test('direct Google Maps coordinates and strict host allowlist', () => {
    assert.deepEqual(parseGoogleMapsCoordinates('https://www.google.com/maps?q=25.03,121.56'), { lat: 25.03, lng: 121.56 });
    assert.deepEqual(parseGoogleMapsCoordinates('https://google.com/maps/@25.03,121.56,17z'), { lat: 25.03, lng: 121.56 });
    assert.equal(parseGoogleMapsCoordinates('https://maps.app.goo.gl/short'), null);
    assert.equal(mapUrlHostAllowed('https://maps.app.goo.gl/short'), true);
    assert.equal(mapUrlHostAllowed('http://google.com/maps?q=1,2'), false);
    assert.equal(mapUrlHostAllowed('https://google.com.evil.test/maps?q=1,2'), false);
    assert.equal(mapUrlHostAllowed('https://evil.test/?next=google.com'), false);
    assert.equal(mapUrlHostAllowed('https://u:p@google.com/maps'), false);
});

test('export filename removes unsafe characters', () => {
    assert.equal(safeFilename('東京:/<秋旅>?', new Date(2026, 8, 26)), 'YashYash_東京___秋旅___20260926.xlsx');
});
