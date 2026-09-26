# YashYash v2.1 — Itinerary Import / Export

## Goal
Add a standard XLSX round-trip workflow so a Trip participant can:
1. download a YashYash template,
2. give it to AI or edit it manually,
3. preview/validate the import,
4. resolve map locations,
5. merge or replace the itinerary,
6. export the resulting Trip back to the same XLSX format.

XLSX is the only import/export format in this phase.

## Workbook contract
Required worksheet: `行程`

Columns:
`Day | Date | Time | Title | Address | GoogleMapsURL | Note | Latitude | Longitude`

Required per row:
- `Day`
- `Title`

Rules:
- Day is 1-based and is the source of truth.
- Date is optional `YYYY-MM-DD` and is checked against Trip start date + Day offset.
- Time stays plain text; recommended `HH:mm` or `HH:mm-HH:mm`.
- Maximum 500 rows.
- Maximum upload 2 MB.
- Accept `.xlsx` only.
- Reject formulas in import cells; do not evaluate them.
- Ignore documentation sheets other than `行程`.

## Trip location mapping
Existing location:
`name, addr, lat, lng, note, time`

Add optional:
`mapUrl`

Mapping:
- Title -> name
- Address -> addr
- GoogleMapsURL -> mapUrl
- Note -> note
- Time -> time
- Latitude -> lat
- Longitude -> lng

Rows without coordinates are valid itinerary rows, but must not produce a Map marker/polyline point.
Old Trips without mapUrl remain compatible.

## Location resolution priority
1. Valid Latitude + Longitude
2. Parse supported direct Google Maps URL
3. Safely resolve allowlisted Google Maps short URL and parse final URL
4. Browser Google Maps Geocoder using Address
5. Browser Google Places using Title + Address / Title
6. Keep as non-map itinerary row if still unresolved

Never invent coordinates.

Allowed Google hosts for automatic URL handling:
- maps.app.goo.gl
- google.com
- www.google.com
- maps.google.com
- goo.gl only for Maps redirects

If backend follows redirects:
- HTTPS only
- max 5 redirects
- revalidate allowlist every hop
- short timeout
- bounded response
- never fetch arbitrary workbook URLs

## Date validation
Expected date is calculated with calendar-safe/date-only arithmetic.

If imported Date is present and differs from expected Day date:
- preview warning
- no silent correction
- user may continue after acknowledging warnings

Reject:
- invalid Day
- Day outside Trip.days
- invalid Date format
- missing Title
- invalid coordinate pair
- latitude outside -90..90
- longitude outside -180..180

## UX
Trip Details adds one compact `匯入 / 匯出` action.

Actions:
- 下載 AI / Excel 範本
- 匯出目前行程
- 匯入行程
- 複製 AI 提示詞

Import flow:
1. choose XLSX
2. parse
3. normalize
4. resolve locations
5. preview
6. choose Merge or Replace
7. confirm
8. final server validation
9. one atomic Trip update
10. refresh Timeline + Map

Preview must not mutate Trip data.

Preview summary:
- total rows
- map-resolved rows
- unresolved rows
- warnings
- errors

Per row:
- 可匯入
- 需確認
- 無地圖定位
- 錯誤

Unresolved rows can:
- remain non-map
- be manually resolved
- be excluded

## Merge / Replace
Merge:
- preserve existing items
- append imported rows to each Day in XLSX row order

Replace:
- replace all day locations from imported content
- require destructive confirmation including current item count
- offer export-backup first

Final import must construct the entire resulting days array in memory and perform one database update. No partial day-by-day writes.

## Export
Export same columns and preserve mapUrl.

Filename:
`YashYash_<TripTitle>_<YYYYMMDD>.xlsx`

Use values only, never formulas.

## Suggested API
- `GET /api/trips/:id/itinerary/template.xlsx`
- `GET /api/trips/:id/itinerary/export.xlsx`
- `POST /api/trips/:id/itinerary/import/preview`
- `POST /api/trips/:id/itinerary/import`

All routes authenticated and Trip-authorized. Do not create public routes.

## Implementation
Recommended:
- backend `exceljs`
- bounded multipart memory upload such as `multer`
- max 2 MB
- one file
- XLSX/ZIP signature validation
- no permanent upload storage

Prefer existing browser Google Maps JavaScript API for Geocoder/Places resolution so no new unrestricted backend Maps key is required.

## Security
- no untrusted innerHTML
- textContent / DOM APIs only
- reject formula cells
- cap string sizes: Title 200, Address 500, URL 2000, Note 3000, Time 50
- final server validation of client-resolved coordinates
- no workbook content or token logging
- arbitrary URLs are never fetched

## PWA
Current production cache after Phase 7:
`yashyash-v19`

Bump once at finalization:
`yashyash-v20`

## Tests
Add tests for:
- header validation
- Day bounds
- required fields
- date mismatch warnings
- coordinate validation
- formula-cell rejection
- 500-row boundary
- merge
- replace
- mapUrl round-trip
- filename sanitization
- direct Google Maps coordinate parsing
- Google URL allowlist
- old locations without mapUrl

Run:
- npm test
- node --check changed JS
- git diff --check

## Manual smoke
- template download
- import row with coordinates
- row with Address only
- row with Google Maps URL
- row with no map location
- preview status
- Merge
- refresh Timeline + Map
- Export
- Replace with exported workbook
- verify round-trip
- mobile at 390px
