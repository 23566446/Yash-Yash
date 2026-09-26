const ExcelJS = require('exceljs');

const HEADERS = ['Day', 'Date', 'Time', 'Title', 'Address', 'GoogleMapsURL', 'Note', 'Latitude', 'Longitude'];
const MAX_ROWS = 500;
const ALLOWED_MAP_HOSTS = new Set(['maps.app.goo.gl', 'google.com', 'www.google.com', 'maps.google.com', 'goo.gl']);

function mapUrlHostAllowed(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && ALLOWED_MAP_HOSTS.has(url.hostname.toLowerCase())
            && !url.username && !url.password && (!url.port || url.port === '443');
    } catch { return false; }
}

function validCoordinatePair(lat, lng) {
    return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90
        && typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function parseGoogleMapsCoordinates(value) {
    if (!mapUrlHostAllowed(value)) return null;
    const url = new URL(value);
    if (!['google.com', 'www.google.com', 'maps.google.com'].includes(url.hostname.toLowerCase())) return null;
    const candidates = [url.searchParams.get('query'), url.searchParams.get('q'), url.searchParams.get('destination')];
    let match;
    for (const candidate of candidates) {
        match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(candidate || '');
        if (match) break;
    }
    if (!match && /^\/maps\/@/.test(url.pathname)) match = /^\/maps\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/.exec(url.pathname);
    if (!match) match = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url.pathname);
    if (!match) return null;
    const lat = Number(match[1]), lng = Number(match[2]);
    return validCoordinatePair(lat, lng) ? { lat, lng } : null;
}

function dateForDay(startDate, day) {
    const [year, month, date] = startDate.split('-').map(Number);
    const result = new Date(Date.UTC(year, month - 1, date + day - 1));
    return result.toISOString().slice(0, 10);
}

function stringCell(value, limit, label, errors) {
    if (value == null || value === '') return '';
    if (typeof value !== 'string' && typeof value !== 'number') {
        errors.push(`${label} 格式不合法`);
        return '';
    }
    const text = String(value).trim();
    if (text.length > limit) errors.push(`${label} 超過 ${limit} 字`);
    return text;
}

function coordinateCell(value, label, errors) {
    if (value == null || value === '') return null;
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) {
        errors.push(`${label} 不合法`);
        return null;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) errors.push(`${label} 不合法`);
    return number;
}

function normalizeRow(values, rowNumber, trip) {
    const errors = [], warnings = [];
    const [rawDay, rawDate, rawTime, rawTitle, rawAddress, rawUrl, rawNote, rawLat, rawLng] = values;
    const day = Number(rawDay);
    if (!Number.isInteger(day) || day < 1 || day > trip.days.length) errors.push('Day 超出行程天數');
    const name = stringCell(rawTitle, 200, 'Title', errors);
    if (!name) errors.push('Title 必填');
    const addr = stringCell(rawAddress, 500, 'Address', errors);
    const time = stringCell(rawTime, 50, 'Time', errors);
    const note = stringCell(rawNote, 3000, 'Note', errors);
    const mapUrl = stringCell(rawUrl, 2000, 'GoogleMapsURL', errors);
    const date = rawDate instanceof Date && !Number.isNaN(rawDate.getTime())
        ? rawDate.toISOString().slice(0, 10)
        : stringCell(rawDate, 10, 'Date', errors);
    if (date) {
        const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
        if (!parsed) errors.push('Date 必須是 YYYY-MM-DD');
        else if (Number.isInteger(day) && day >= 1 && day <= trip.days.length && date !== dateForDay(trip.startDate, day)) warnings.push('Date 與行程日期不符');
    }
    let lat = coordinateCell(rawLat, 'Latitude', errors);
    let lng = coordinateCell(rawLng, 'Longitude', errors);
    if ((lat == null) !== (lng == null)) errors.push('Latitude / Longitude 必須成對填寫');
    if (lat != null && lng != null && !validCoordinatePair(lat, lng)) errors.push('座標超出範圍');
    if (mapUrl && !mapUrlHostAllowed(mapUrl)) warnings.push('GoogleMapsURL 不在允許的 Google Maps 網域；不會自動定位');
    if (lat == null && lng == null && mapUrl) {
        const parsed = parseGoogleMapsCoordinates(mapUrl);
        if (parsed) { lat = parsed.lat; lng = parsed.lng; }
    }
    return { rowNumber, day, date, name, addr, time, note, mapUrl, lat, lng, warnings, errors };
}

async function parseWorkbook(buffer, trip) {
    if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 4).toString('hex') !== '504b0304') throw new Error('請上傳有效的 XLSX 檔案');
    const book = new ExcelJS.Workbook();
    try { await book.xlsx.load(buffer); } catch { throw new Error('無法讀取 XLSX；加密檔案不支援'); }
    const sheet = book.getWorksheet('行程');
    if (!sheet) throw new Error('缺少「行程」工作表');
    if (HEADERS.some((header, index) => sheet.getRow(1).getCell(index + 1).value !== header)) throw new Error('行程欄位與範本不符');
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const cells = HEADERS.map((_, index) => row.getCell(index + 1));
        if (cells.every(cell => cell.value == null || cell.value === '')) return;
        if (rows.length >= MAX_ROWS) throw new Error('最多只能匯入 500 筆');
        const values = cells.map(cell => cell.value);
        const parsed = normalizeRow(values, rowNumber, trip);
        if (values.some(value => value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value))) parsed.errors.push('不允許公式儲存格');
        rows.push(parsed);
    });
    return rows;
}

function applyImport(trip, rows, mode, decisions = {}) {
    if (!['merge', 'replace'].includes(mode)) throw new Error('匯入模式不合法');
    const days = trip.days.map(day => ({
        ...day,
        locations: mode === 'merge' ? [...day.locations] : []
    }));
    for (const row of rows) {
        if (row.errors.length) throw new Error(`第 ${row.rowNumber} 列有錯誤`);
        const decision = decisions[row.rowNumber] || {};
        if (decision.exclude === true) continue;
        let { lat, lng } = row;
        if (decision.lat != null || decision.lng != null) {
            lat = decision.lat;
            lng = decision.lng;
            if (!validCoordinatePair(lat, lng)) throw new Error(`第 ${row.rowNumber} 列定位不合法`);
        }
        const location = { name: row.name, addr: row.addr, mapUrl: row.mapUrl, note: row.note, time: row.time };
        if (lat != null && lng != null) Object.assign(location, { lat, lng });
        days[row.day - 1].locations.push(location);
    }
    return days;
}

function safeFilename(title, date = new Date()) {
    const clean = String(title || 'Trip').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80) || 'Trip';
    return `YashYash_${clean}_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}.xlsx`;
}

function buildWorkbook(trip, includeLocations = true) {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('行程');
    sheet.addRow(HEADERS);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF55643A' } };
    sheet.columns = [8, 16, 14, 32, 44, 52, 44, 14, 14].map(width => ({ width }));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    if (includeLocations) trip.days.forEach((day, index) => day.locations.forEach(loc => sheet.addRow([
        index + 1, dateForDay(trip.startDate, index + 1), loc.time || '', loc.name || '', loc.addr || '',
        loc.mapUrl || '', loc.note || '', loc.lat ?? '', loc.lng ?? ''
    ])));
    return book;
}

module.exports = { HEADERS, MAX_ROWS, mapUrlHostAllowed, parseGoogleMapsCoordinates, dateForDay, normalizeRow, parseWorkbook, applyImport, safeFilename, buildWorkbook };
