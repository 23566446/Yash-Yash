(function () {
    const dialog = document.getElementById('itinerary-transfer-dialog');
    const fileInput = document.getElementById('itinerary-import-file');
    const status = document.getElementById('itinerary-transfer-status');
    const previewPanel = document.getElementById('itinerary-preview');
    const summary = document.getElementById('itinerary-preview-summary');
    const rowList = document.getElementById('itinerary-preview-rows');
    const acknowledge = document.getElementById('itinerary-warning-ack');
    const confirmButton = document.getElementById('itinerary-import-confirm');
    let sourceFile = null;
    let rows = [];
    let existingCount = 0;
    let previewVersion = null;
    let busy = false;
    let generation = 0;

    function setStatus(message) { status.textContent = message; }
    function validCoordinates(lat, lng) {
        return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180;
    }
    function counts() {
        const active = rows.filter(row => !row.excluded);
        const resolved = active.filter(row => validCoordinates(row.lat, row.lng)).length;
        const errors = active.reduce((count, row) => count + row.errors.length, 0);
        const warnings = active.reduce((count, row) => count + row.warnings.length + Number(Boolean(row.reviewMessage)), 0);
        summary.textContent = `共 ${rows.length} 列 · 已定位 ${resolved} · 待定位 ${active.length - resolved} · 警告 ${warnings} · 錯誤 ${errors} · 現有 ${existingCount} 個地點`;
        confirmButton.disabled = busy || previewVersion === null || !active.length || errors > 0 || resolved !== active.length || (warnings > 0 && !acknowledge.checked);
    }
    function appendText(parent, tag, className, value) {
        const node = document.createElement(tag);
        node.className = className;
        node.textContent = value;
        parent.appendChild(node);
        return node;
    }
    function refreshRow(row) {
        const state = row.element.querySelector('.transfer-row-state');
        const resolved = validCoordinates(row.lat, row.lng);
        state.textContent = row.excluded ? '已排除' : row.errors.length ? '錯誤'
            : !resolved ? '找不到地點' : row.warnings.length || row.reviewMessage ? '需確認' : '可匯入';
        row.element.classList.toggle('is-excluded', Boolean(row.excluded));
        const issues = row.element.querySelector('.transfer-row-issues');
        issues.textContent = [...row.errors, ...row.warnings, row.reviewMessage,
            !row.excluded && !row.errors.length && !resolved ? '請手動定位或排除此列' : ''].filter(Boolean).join('；');
        const coordinates = row.element.querySelector('.transfer-row-coordinates');
        coordinates.textContent = validCoordinates(row.lat, row.lng)
            ? `地圖定位：${row.lat.toFixed(6)}, ${row.lng.toFixed(6)}`
            : '尚未定位';
        counts();
    }
    async function lookupLocation(query, addressFirst) {
        if (!window.google?.maps) return null;
        if (addressFirst) {
            try {
                const coder = geocoder || new google.maps.Geocoder();
                const result = await coder.geocode({ address: query });
                const point = result.results?.[0]?.geometry?.location;
                if (point && validCoordinates(point.lat(), point.lng())) return { lat: point.lat(), lng: point.lng() };
            } catch { /* Places text search may still succeed. */ }
        }
        try {
            const Place = PlaceClass || (await google.maps.importLibrary('places')).Place;
            const result = await Place.searchByText({ textQuery: query, fields: ['location'], maxResultCount: 1 });
            const point = result.places?.[0]?.location;
            if (point && validCoordinates(point.lat(), point.lng())) return { lat: point.lat(), lng: point.lng() };
        } catch { /* Keep the row without a map location. */ }
        return null;
    }
    async function resolveRow(row, query, addressFirst, token) {
        const point = await lookupLocation(query, addressFirst);
        if (token !== generation) return;
        if (point) {
            Object.assign(row, point);
            row.reviewMessage = '搜尋定位結果請核對';
            refreshRow(row);
        }
        return Boolean(point);
    }
    function renderRows() {
        rowList.replaceChildren();
        rows.forEach(row => {
            const card = document.createElement('article');
            card.className = 'transfer-row';
            row.element = card;
            const top = document.createElement('div');
            top.className = 'transfer-row-top';
            appendText(top, 'strong', '', `第 ${row.rowNumber} 列 · Day ${row.day} · ${row.name || '未填地點'}`);
            appendText(top, 'span', 'transfer-row-state', '');
            card.appendChild(top);
            appendText(card, 'p', 'transfer-row-meta', [row.date, row.time, row.addr].filter(Boolean).join(' · '));
            appendText(card, 'p', 'transfer-row-coordinates', '');
            appendText(card, 'p', 'transfer-row-issues', '');
            if (!row.errors.length) {
                const controls = document.createElement('div');
                controls.className = 'transfer-row-controls';
                const query = document.createElement('input');
                query.type = 'text';
                query.maxLength = 500;
                query.value = row.addr || '';
                query.setAttribute('aria-label', `第 ${row.rowNumber} 列搜尋文字`);
                const lookup = document.createElement('button');
                lookup.type = 'button';
                lookup.textContent = '搜尋定位';
                lookup.addEventListener('click', async () => {
                    if (!query.value.trim()) return;
                    lookup.disabled = true;
                    setStatus(`正在搜尋第 ${row.rowNumber} 列…`);
                    const found = await resolveRow(row, query.value.trim(), true, generation);
                    setStatus(found ? '已找到位置，請核對後確認。' : '找不到地點，請換個搜尋詞、手動填入座標或排除此列。');
                    lookup.disabled = false;
                });
                const latitude = document.createElement('input');
                latitude.type = 'number'; latitude.step = 'any'; latitude.placeholder = '緯度';
                latitude.setAttribute('aria-label', `第 ${row.rowNumber} 列緯度`);
                const longitude = document.createElement('input');
                longitude.type = 'number'; longitude.step = 'any'; longitude.placeholder = '經度';
                longitude.setAttribute('aria-label', `第 ${row.rowNumber} 列經度`);
                const apply = document.createElement('button');
                apply.type = 'button'; apply.textContent = '套用座標';
                apply.addEventListener('click', () => {
                    const lat = Number(latitude.value), lng = Number(longitude.value);
                    if (!latitude.value || !longitude.value || !validCoordinates(lat, lng)) {
                        setStatus('請輸入有效的成對緯度與經度。');
                        return;
                    }
                    Object.assign(row, { lat, lng, reviewMessage: '手動座標請核對' });
                    refreshRow(row);
                    setStatus('已套用座標，請核對後確認。');
                });
                const exclude = document.createElement('label');
                exclude.className = 'transfer-exclude';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.addEventListener('change', () => { row.excluded = checkbox.checked; refreshRow(row); });
                exclude.append(checkbox, document.createTextNode(' 排除此列'));
                controls.append(query, lookup, latitude, longitude, apply, exclude);
                card.appendChild(controls);
            }
            rowList.appendChild(card);
            refreshRow(row);
        });
    }
    async function previewFile(file) {
        const token = ++generation;
        rows = []; sourceFile = null; previewVersion = null;
        previewPanel.classList.add('hidden');
        if (!file) return;
        if (!/\.xlsx$/i.test(file.name) || file.size > 2 * 1024 * 1024) {
            setStatus('請選擇 2 MB 以下的 .xlsx 檔案。');
            return;
        }
        busy = true;
        setStatus('正在驗證 XLSX…');
        try {
            const form = new FormData();
            form.append('file', file);
            const response = await apiFetch(`${API_URL}/api/trips/${encodeURIComponent(tripId)}/itinerary/import/preview`, { method: 'POST', body: form });
            const result = await response.json();
            if (!response.ok) {
                const error = new Error(result.message || '檔案驗證失敗');
                error.code = result.code;
                throw error;
            }
            if (!Number.isSafeInteger(result.tripVersion) || result.tripVersion < 0) throw new Error('預覽版本不合法，請重新預覽');
            if (token !== generation) return;
            sourceFile = file;
            rows = result.rows;
            existingCount = result.existingCount;
            previewVersion = result.tripVersion;
            acknowledge.checked = false;
            previewPanel.classList.remove('hidden');
            renderRows();
            for (const row of rows) {
                if (token !== generation) return;
                if (row.errors.length || validCoordinates(row.lat, row.lng)) continue;
                setStatus(`正在解析位置：第 ${row.rowNumber} 列…`);
                if (!row.addr) continue;
                if (await resolveRow(row, row.addr, true, token)) continue;
                await resolveRow(row, `${row.name} ${row.addr}`, false, token);
            }
            if (token === generation) setStatus('預覽完成。找不到地點的列需手動定位或排除，才能確認匯入。');
        } catch (error) {
            if (token === generation) setStatus(`${error.message || '預覽失敗'}${error.code ? ` (${error.code})` : ''}`);
        } finally {
            if (token === generation) { busy = false; counts(); }
        }
    }
    async function download(kind) {
        try {
            setStatus('正在準備下載…');
            const response = await apiFetch(`${API_URL}/api/trips/${encodeURIComponent(tripId)}/itinerary/${kind}.xlsx`);
            if (!response.ok) throw new Error('下載失敗');
            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
            const filename = (encodedName ? decodeURIComponent(encodedName) : disposition.match(/filename="([^"]+)"/)?.[1])
                || (kind === 'template' ? 'YashYash_Itinerary_Template.xlsx' : 'YashYash_Itinerary.xlsx');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = filename;
            document.body.appendChild(link);
            link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            setStatus('下載已開始。');
        } catch (error) { setStatus(error.message || '下載失敗'); }
    }
    async function submitImport() {
        if (!sourceFile || confirmButton.disabled) return;
        const mode = document.querySelector('input[name="itinerary-import-mode"]:checked').value;
        if (mode === 'replace' && !window.confirm(`將取代現有 ${existingCount} 個行程地點。請先匯出備份。確定繼續？`)) return;
        const decisions = {};
        rows.forEach(row => {
            if (row.excluded) decisions[row.rowNumber] = { exclude: true };
            else if (validCoordinates(row.lat, row.lng)) decisions[row.rowNumber] = { lat: row.lat, lng: row.lng };
        });
        const form = new FormData();
        form.append('file', sourceFile);
        form.append('mode', mode);
        form.append('decisions', JSON.stringify(decisions));
        form.append('acknowledgeWarnings', String(acknowledge.checked));
        form.append('confirmReplace', String(mode === 'replace'));
        form.append('previewVersion', String(previewVersion));
        busy = true; counts();
        setStatus('正在更新行程…');
        try {
            const response = await apiFetch(`${API_URL}/api/trips/${encodeURIComponent(tripId)}/itinerary/import`, { method: 'POST', body: form });
            const result = await response.json();
            if (!response.ok || !Array.isArray(result.days)) {
                const error = new Error(result.message || '匯入失敗');
                error.status = response.status;
                error.code = result.code;
                throw error;
            }
            currentTripData = result;
            renderItinerary();
            renderMarkers();
            dialog.close();
            window.showToast?.('行程匯入完成');
        } catch (error) {
            if (error.status === 409) {
                sourceFile = null;
                previewVersion = null;
                fileInput.value = '';
                previewPanel.classList.add('hidden');
            }
            setStatus(`${error.message || '匯入失敗，原行程未變更。'}${error.code ? ` (${error.code})` : ''}`);
        }
        finally { busy = false; counts(); }
    }

    document.getElementById('itinerary-transfer-open').addEventListener('click', () => dialog.showModal());
    document.getElementById('itinerary-transfer-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        generation++;
        busy = false;
        rows = [];
        sourceFile = null;
        previewVersion = null;
        fileInput.value = '';
        previewPanel.classList.add('hidden');
        setStatus('');
    });
    fileInput.addEventListener('change', () => previewFile(fileInput.files?.[0]));
    acknowledge.addEventListener('change', counts);
    document.querySelectorAll('input[name="itinerary-import-mode"]').forEach(input => input.addEventListener('change', counts));
    document.getElementById('itinerary-template-download').addEventListener('click', () => download('template'));
    document.getElementById('itinerary-export-download').addEventListener('click', () => download('export'));
    document.getElementById('itinerary-backup-download').addEventListener('click', () => download('export'));
    document.getElementById('itinerary-import-confirm').addEventListener('click', submitImport);
    document.getElementById('itinerary-prompt-copy').addEventListener('click', async () => {
        const prompt = `請將以下旅遊計畫整理成 YashYash XLSX。只建立「行程」工作表，第一列欄位依序是：Day, Date, Time, Title, Address, GoogleMapsURL, Note, Latitude, Longitude。每列必須有 1 起算的 Day 和 Title；日期用 YYYY-MM-DD，對應行程開始日 ${currentTripData?.startDate || ''}；最多 500 列。每列必須是真實且可定位的地點，請提供可靠的 Address、GoogleMapsURL 或座標；不要猜測經緯度。沒有實際地點的純活動文字請放在相關地點的 Note，不要建立無法定位的獨立列。不要放公式。請輸出 .xlsx 檔案。`;
        try { await navigator.clipboard.writeText(prompt); setStatus('AI 提示詞已複製。'); }
        catch { setStatus('無法複製，請檢查瀏覽器剪貼簿權限。'); }
    });
}());
