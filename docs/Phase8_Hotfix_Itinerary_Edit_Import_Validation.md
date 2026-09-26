# Phase 8 Hotfix — Itinerary Editing, Map-required Import, Diagnostics and Transfer UI

Base production commit: `9e7f1b090681bb0baaca46882ffd97100713a64d`

Branch: `hotfix-phase8-itinerary-edit-import-validation`

## Scope

This hotfix follows successful production smoke testing of Phase 8.

Implement only:
1. editing itinerary stop text fields,
2. requiring every imported row that is actually imported to resolve to a map location,
3. safer/more useful XLSX diagnostics and logs,
4. import/export dialog radio/checkbox UI polish,
5. PWA cache bump.

Do not redesign unrelated pages.

## 1. Edit itinerary stop

Current itinerary stops show name/time/note but only support navigation, reorder and delete.

Add an Edit action to each stop.

Editing must support:
- Title / name
- Time
- Note

Keep the existing address and coordinates unchanged in this hotfix. Do not silently geocode when editing text.

Suggested endpoint:
`PUT /api/trips/:id/location`

Body:
```json
{
  "dayIndex": 0,
  "locationIndex": 0,
  "name": "台北 101",
  "time": "09:00",
  "note": "..."
}
```

Validation:
- dayIndex/locationIndex integer and in range
- name non-empty, <= 200
- time string <= 50
- note string <= 3000
- authenticated Trip participant only

Return updated Trip.

Frontend:
- use an accessible modal/sheet or compact inline editor
- do not use prompt()
- Save / Cancel
- after save refresh timeline and markers
- use textContent/DOM APIs, never untrusted innerHTML
- add icon-only edit button with title + aria-label
- keep drag/navigation/delete behavior

## 2. Imported rows must resolve to the map

Product rule after production testing:

Every included imported itinerary row represents a real stop and must have valid coordinates before final import.

There is no longer a supported "import as non-map row" mode.

Resolution priority remains:
1. Latitude + Longitude
2. directly parseable Google Maps URL
3. Address geocode
4. Places search using Title + Address

Important:
- Do NOT automatically search by Title alone when Address is blank.
- Generic titles such as "回飯店休息" must never be guessed into an unrelated Google place.
- If a row has no coordinates and no useful Address/direct map coordinates, mark it unresolved.
- An unresolved row must block Confirm Import unless the user either:
  - manually resolves it with search/coordinates, or
  - excludes the row.
- Excluded rows are not imported.
- Final server import MUST independently enforce valid coordinates for every non-excluded row. Do not rely only on frontend validation.
- After import, every imported row must therefore render a marker and participate in the active-day route.

Preview statuses should be clear, e.g.:
- 可匯入
- 需確認
- 找不到地點
- 錯誤
- 已排除

Remove wording that implies a normal imported row may intentionally remain without map coordinates.

Preview summary should use terms such as:
- 共 N 列
- 已定位 N
- 待定位 N
- 警告 N
- 錯誤 N

## 3. AI prompt / template guidance

Update the copied AI prompt so it clearly says:
- every itinerary row should represent a mappable stop,
- provide reliable Address, GoogleMapsURL, or coordinates for every row,
- do not invent coordinates,
- generic activities without a real place should be placed in Note of the relevant stop instead of becoming their own unmappable row.

Do not remove XLSX round-trip compatibility.

## 4. XLSX diagnostics and logging

Current parse failure message is too generic:
"無法讀取 XLSX；加密檔案不支援"

Add categorized safe diagnostics.

Recommended error codes:
- XLSX_INVALID_FILE
- XLSX_TOO_LARGE
- XLSX_PARSE_FAILED
- XLSX_MISSING_SHEET
- XLSX_HEADER_MISMATCH
- XLSX_ROW_LIMIT
- XLSX_FORMULA_NOT_ALLOWED
- XLSX_ROW_INVALID
- IMPORT_UNRESOLVED_LOCATION
- IMPORT_VERSION_CONFLICT

Exact naming can vary if consistent.

HTTP error responses should return:
```json
{
  "message": "human-friendly Traditional Chinese message",
  "code": "XLSX_PARSE_FAILED"
}
```

For unexpected XLSX parse errors, log structured metadata only, for example:
- operation/stage
- code/category
- error.name
- safe error.message
- upload byte size

Do NOT log:
- workbook row contents
- addresses
- notes
- map URLs
- auth tokens
- JWTs
- Mongo URI
- secrets

The UI should show the useful human message and, where helpful, the diagnostic code in a subtle way.

Do not expose stack traces to the browser.

Different failure causes should not all become the encryption message.

## 5. Transfer dialog UI

Production smoke test showed the import-mode radio controls and warning checkbox rendering far too large.

Redesign the controls while preserving native accessibility.

Import mode:
- two compact selectable cards
- "合併" with secondary text "保留原有行程，依順序追加"
- "取代" with secondary text "清除原有行程後重新匯入"
- radio circle about 18–20px, never stretched
- selected card gets subtle olive border/background
- cards side-by-side when there is room, stack on narrow mobile

Acknowledgement:
- compact checkbox row/card
- checkbox about 18–20px
- label aligned horizontally
- minimum 44px clickable label target

Also fix `.transfer-exclude` checkbox sizing so it cannot inherit full-width/global input styles.

Use existing YashYash warm cream / olive styling.

## 6. PWA

Production is currently `yashyash-v20`.

Because cached HTML/CSS/JS change, bump once to:
`yashyash-v21`

Verify all precache paths exist.

## 7. Tests

Add/adjust tests for:
- final import/applyImport rejects non-excluded unresolved rows
- excluded unresolved row is allowed because it is not imported
- Title-only generic row is not treated as automatically resolved
- location edit validation helper if extracted
- diagnostic error codes/categories where practical
- existing XLSX round trip stays passing
- old Trip locations remain compatible

Run:
- npm test
- node --check on changed standalone JS
- git diff --check

## 8. Manual/static checks

Check at 390 / 768 / 1024 / 1440:
- radio controls no longer oversized
- acknowledgement and exclude checkboxes no longer oversized
- transfer modal does not overflow
- edit dialog is usable
- imported unresolved row clearly blocks confirmation
- Timeline edit preserves map coordinates
- marker/navigation/reorder/delete still work

## Git workflow

Do not modify main directly.
Work only on:
`hotfix-phase8-itinerary-edit-import-validation`

Prefer commits:
1. `fix: require map locations for itinerary imports`
2. `feat: add itinerary stop editing`
3. `fix: improve import diagnostics and transfer controls`

Push branch and create ONE Draft PR targeting main.

PR title:
`Phase 8 Hotfix - Itinerary Editing and Import Validation`

Do NOT merge.
Do NOT mark Ready.

Final response should summarize implemented areas, tests, remaining live checks, branch, commits and Draft PR.
