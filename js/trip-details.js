const API_URL = window.YashYashConfig.API_URL;
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
let currentUser = null;

let map, markers = [];
let currentTripData = null;
let activeDayIndex = 0; 
let sortables = [];

// 地圖輔助變數
let tempMarker = null;
let infoWindow;
let geocoder;
let PlaceClass;
let polyline = null; 

let participantsPopoverBound = false;

// === 初始化載入 ===
window.onload = async () => {
    currentUser = await window.YashYashSession.ready;
    if (!tripId) {
        alert("找不到行程 ID");
        return;
    }
    
    // 第一步：先抓資料
    await fetchTripDetails(); 
    
    // 第二步：資料抓完後，才初始化地圖
    await initMap();
};

async function fetchTripDetails() {
    try {
        const response = await apiFetch(`${API_URL}/api/trips/${tripId}`);
        if (response.status === 403) {
            alert('你沒有權限存取這個內容');
            window.location.href = 'index.html';
            return;
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        currentTripData = await response.json();
        document.getElementById('itinerary-transfer-open').classList.toggle('hidden', !currentTripData.participants?.includes(currentUser.account));
        console.log("✅ 行程資料載入成功:", currentTripData);

        const titleTextEl = document.getElementById('trip-title-text');
        if (titleTextEl) titleTextEl.innerText = currentTripData.title;
        else document.getElementById('trip-title').innerText = currentTripData.title;

        await renderTripParticipants(currentTripData.participants || []);

        const isOwner = currentTripData.creatorAccount === currentUser.account;
        const isAdmin = currentUser.role === 'admin';
        const canEdit = isOwner || isAdmin;

        if (canEdit) {
            document.getElementById('edit-date-btn').classList.remove('hidden');
            document.getElementById('delete-trip-btn').classList.remove('hidden');
        }
        renderItinerary();
    } catch (err) {
        console.error("❌ 載入詳情失敗:", err);
        alert("載入行程失敗，請重新整理頁面");
    }
}

async function fetchUsersByAccounts(accounts) {
    const unique = Array.from(new Set((accounts || []).filter(Boolean)));
    if (unique.length === 0) return [];
    const qs = encodeURIComponent(unique.join(','));
    const res = await fetch(`${API_URL}/api/users/by-accounts?accounts=${qs}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

function getParticipantDisplayName(p) {
    if (!p) return "未知";
    const nick = (p.nickname || "").trim();
    const acc = (p.account || "").trim();
    if (nick && acc && nick !== acc) return `${nick} (${acc})`;
    return nick || acc || "未知";
}

function getParticipantInitial(p) {
    const name = getParticipantDisplayName(p).trim();
    return name ? name[0].toUpperCase() : "?";
}

function createParticipantAvatarEl(p) {
    const wrap = document.createElement('div');
    wrap.className = 'trip-participant-avatar';
    wrap.title = getParticipantDisplayName(p);

    const avatar = window.safeImageSource((p?.avatar || "").trim(), '');
    if (avatar) {
        const img = document.createElement('img');
        img.src = avatar;
        img.alt = getParticipantDisplayName(p);
        img.addEventListener('error', () => {
            img.remove();
            wrap.textContent = getParticipantInitial(p);
        });
        wrap.appendChild(img);
    } else {
        wrap.textContent = getParticipantInitial(p);
    }
    return wrap;
}

function bindParticipantsPopoverGlobalClose() {
    if (participantsPopoverBound) return;
    participantsPopoverBound = true;

    document.addEventListener('click', () => {
        const pop = document.getElementById('trip-participant-popover');
        if (pop) pop.classList.add('hidden');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const pop = document.getElementById('trip-participant-popover');
        if (pop) pop.classList.add('hidden');
    });
}

async function renderTripParticipants(accounts) {
    const container = document.getElementById('trip-participants');
    if (!container) return;

    container.innerHTML = '';
    if (!Array.isArray(accounts) || accounts.length === 0) return;

    bindParticipantsPopoverGlobalClose();

    let profiles = [];
    try {
        profiles = await fetchUsersByAccounts(accounts);
    } catch (e) {
        console.warn("載入參與者頭像失敗，改用 fallback:", e);
        profiles = accounts.map(a => ({ account: a, nickname: a, avatar: "" }));
    }

    const visible = profiles.slice(0, 3);
    const hidden = profiles.slice(3);

    visible.forEach(p => {
        container.appendChild(createParticipantAvatarEl(p));
    });

    if (hidden.length > 0) {
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'trip-participant-more';
        moreBtn.textContent = `+${hidden.length}`;
        moreBtn.title = hidden.map(getParticipantDisplayName).join('\n');
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pop = document.getElementById('trip-participant-popover');
            if (pop) pop.classList.toggle('hidden');
        });

        const popover = document.createElement('div');
        popover.id = 'trip-participant-popover';
        popover.className = 'trip-participant-popover hidden';
        popover.addEventListener('click', (e) => e.stopPropagation());

        hidden.forEach(p => {
            const row = document.createElement('div');
            row.className = 'trip-participant-row';
            row.appendChild(createParticipantAvatarEl(p));

            const name = document.createElement('div');
            name.className = 'trip-participant-name';
            name.textContent = getParticipantDisplayName(p);

            row.appendChild(name);
            popover.appendChild(row);
        });

        container.appendChild(moreBtn);
        container.appendChild(popover);
    }
}

function renderItinerary() {
    const container = document.getElementById('days-container');
    const selector = document.getElementById('day-selector');
    if (!container || !currentTripData) return;
    sortables.forEach(s => s.destroy?.());
    sortables = [];
    const days = currentTripData.days || [];
    activeDayIndex = Math.max(0, Math.min(activeDayIndex, days.length - 1));
    selector.replaceChildren();
    days.forEach((day, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'day-tab';
        button.setAttribute('aria-current', index === activeDayIndex ? 'date' : 'false');
        button.setAttribute('aria-controls', 'days-container');
        const label = document.createElement('strong');
        label.textContent = `Day ${index + 1}`;
        const date = document.createElement('span');
        date.textContent = window.YashYashTripOrder.tripDayLabel(currentTripData.startDate, index, false);
        button.append(label, date);
        button.addEventListener('click', () => setActiveDay(index));
        selector.appendChild(button);
    });
    const day = days[activeDayIndex];
    container.replaceChildren();
    if (!day) return;
    const summary = document.createElement('header');
    summary.className = 'day-summary';
    const heading = document.createElement('h2');
    heading.textContent = `Day ${activeDayIndex + 1}`;
    const date = document.createElement('p');
    date.textContent = window.YashYashTripOrder.tripDayLabel(currentTripData.startDate, activeDayIndex);
    const count = document.createElement('span');
    count.textContent = `${day.locations.length} 個地點`;
    summary.append(heading, date, count);
    const list = document.createElement('div');
    list.className = 'location-list';
    list.id = `list-${activeDayIndex}`;
    if (!day.locations.length) {
        const empty = document.createElement('div');
        empty.className = 'planner-empty';
        const title = document.createElement('h3');
        title.textContent = '這天還沒有安排';
        const hint = document.createElement('p');
        hint.textContent = '從上方搜尋地點，或直接點地圖加入。';
        empty.append(title, hint);
        list.appendChild(empty);
    }
    day.locations.forEach((loc, locIdx) => {
        const lat = loc.lat == null ? NaN : Number(loc.lat);
        const lng = loc.lng == null ? NaN : Number(loc.lng);
        const valid = Number.isFinite(lat) && Number.isFinite(lng);
        const stop = document.createElement('div');
        stop.className = 'itinerary-stop location-item';
        const marker = document.createElement('span');
        marker.className = 'stop-marker';
        marker.textContent = String(locIdx + 1);
        const content = document.createElement('div');
        content.className = 'stop-content';
        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'stop-title';
        name.textContent = loc.name;
        name.title = '在地圖上查看';
        name.disabled = !valid;
        name.addEventListener('click', () => focusLocation(lat, lng));
        content.appendChild(name);
        for (const [field, className] of [['time', 'stop-time'], ['note', 'stop-note']]) {
            if (loc[field]) {
                const detail = document.createElement('p');
                detail.className = className;
                detail.textContent = loc[field];
                content.appendChild(detail);
            }
        }
        const actions = document.createElement('div');
        actions.className = 'stop-actions';
        const drag = document.createElement('span');
        drag.className = 'drag-handle';
        drag.textContent = '⠿';
        drag.title = '拖曳調整順序';
        drag.setAttribute('aria-hidden', 'true');
        const navigation = document.createElement('button');
        navigation.type = 'button';
        navigation.textContent = '↗';
        navigation.title = '開啟導航';
        navigation.setAttribute('aria-label', `導航到 ${loc.name}`);
        navigation.disabled = !valid;
        navigation.addEventListener('click', () => startNavigation(lat, lng));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = '移除地點';
        remove.setAttribute('aria-label', `移除 ${loc.name}`);
        remove.addEventListener('click', () => deleteLocation(activeDayIndex, locIdx));
        actions.append(drag, navigation, remove);
        stop.append(marker, content, actions);
        list.appendChild(stop);
    });
    container.append(summary, list);
    if (day.locations.length > 1) {
        const helper = document.createElement('p');
        helper.className = 'planner-hint';
        helper.textContent = '拖曳右側把手調整地點順序';
        container.appendChild(helper);
        if (typeof Sortable !== 'undefined') {
            sortables.push(new Sortable(list, {
                animation: 150,
                handle: '.drag-handle',
                draggable: '.itinerary-stop',
                onEnd: evt => handleReorder(activeDayIndex, evt.oldIndex, evt.newIndex)
            }));
        }
    }
}

function setPlannerView(view, fitMarkers = true) {
    const showMap = view === 'map';
    document.body.dataset.plannerView = showMap ? 'map' : 'itinerary';
    document.querySelectorAll('[data-planner-mode]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.plannerMode === view));
    });
    if (showMap && map) {
        requestAnimationFrame(() => {
            google.maps.event.trigger(map, 'resize');
            if (fitMarkers) renderMarkers();
        });
    }
}

document.querySelectorAll('[data-planner-mode]').forEach(button => {
    button.addEventListener('click', () => setPlannerView(button.dataset.plannerMode));
});

async function initMap() {
    const mapEl = document.getElementById("map");
    if (!mapEl) return;
    if (!window.google?.maps) {
        showMapError();
        return;
    }

    try {
        map = new google.maps.Map(mapEl, {
            center: { lat: 25.0339, lng: 121.5644 },
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            clickableIcons: true
        });
    } catch (error) {
        console.error('Google Maps 載入失敗:', error);
        showMapError();
        return;
    }

    infoWindow = new google.maps.InfoWindow();
    geocoder = new google.maps.Geocoder();

    const input = document.getElementById("pac-input");
    let Place, PlaceAutocompleteElement;
    try {
        ({ Place, PlaceAutocompleteElement } = await google.maps.importLibrary('places'));
    } catch (error) {
        console.error('Google Maps Places 載入失敗:', error);
        showMapError('地點搜尋暫時無法使用，但行程清單仍可編輯。');
        return;
    }
    PlaceClass = Place;
    const placeAutocomplete = new PlaceAutocompleteElement();
    placeAutocomplete.placeholder = '搜尋景點、餐廳或住宿';
    input.replaceChildren(placeAutocomplete);

    placeAutocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
        try {
            const place = placePrediction.toPlace();
            await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
            if (!place.location) return;
            const name = place.displayName?.text || place.displayName || '選定地點';
            showPreview(place.location, name, place.formattedAddress || '');
            map.panTo(place.location);
            map.setZoom(17);
        } catch (error) {
            console.error('地點搜尋失敗:', error);
        }
    });

    map.addListener("click", async (e) => {
        if (e.placeId) {
            e.stop();
            try {
                const place = new PlaceClass({ id: e.placeId });
                await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
                if (!place.location) return;
                const name = place.displayName?.text || place.displayName || '選定地點';
                showPreview(place.location, name, place.formattedAddress || '');
            } catch (error) {
                console.error('地點詳細資料讀取失敗:', error);
            }
        } else {
            findPlaceAddress(e.latLng);
        }
    });

    // 關鍵：地圖閒置後執行
    google.maps.event.addListenerOnce(map, 'idle', () => {
        console.log("✅ 地圖核心已就緒 (idle)");
        if (currentTripData) {
            renderMarkers();
        }
    });
}

function findPlaceAddress(latLng) {
    geocoder.geocode({ location: latLng }, (results, status) => {
        if (status === "OK" && results[0]) {
            const simplifiedName = results[0].address_components[0].long_name;
            showPreview(latLng, simplifiedName, results[0].formatted_address);
        }
    });
}

function showMapError(message = '地圖暫時無法載入，但行程清單仍可使用。') {
    const mapEl = document.getElementById('map');
    if (mapEl) { mapEl.replaceChildren(); const text = document.createElement('p'); text.className = 'empty-text'; text.style.padding = '20px'; text.textContent = message; mapEl.appendChild(text); }
}

function showPreview(latLng, name, address) {
    setPlannerView('map', false);
    if (tempMarker) tempMarker.setMap(null);

    tempMarker = new google.maps.Marker({
        position: latLng,
        map: map,
        icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
        animation: google.maps.Animation.DROP
    });

    const wrapper = document.createElement('div'); wrapper.style.cssText='padding:10px;font-family:sans-serif;max-width:200px;';
    const title = document.createElement('strong'); title.style.cssText='font-size:14px;display:block;margin-bottom:5px;'; title.textContent=name;
    const addressEl = document.createElement('span'); addressEl.style.cssText='font-size:11px;color:#666;display:block;margin-bottom:10px;'; addressEl.textContent=address;
    const button = document.createElement('button'); button.style.cssText='background:#8a9a5b;color:white;border:none;padding:8px;border-radius:4px;cursor:pointer;width:100%;font-weight:bold;'; button.textContent=`確認加入 Day ${activeDayIndex + 1}`;
    button.addEventListener('click', () => confirmAdd(name, address, latLng.lat(), latLng.lng())); wrapper.append(title,addressEl,button);
    infoWindow.setContent(wrapper);
    infoWindow.open(map, tempMarker);
}

async function confirmAdd(name, addr, lat, lng) {
    const locationObj = { 
        name: name, 
        addr: addr, 
        lat: parseFloat(lat), 
        lng: parseFloat(lng) 
    };
    
    await addLocationToDB(locationObj);
    
    if (tempMarker) tempMarker.setMap(null);
    infoWindow.close();
}

function renderMarkers() {
    if (!map || !currentTripData) {
        console.error("❌ 渲染失敗：map 或 currentTripData 未準備好");
        return;
    }

    // 清除舊標記與線段
    markers.forEach(m => m.setMap(null));
    markers = [];
    if (polyline) { polyline.setMap(null); polyline = null; }

    const activeDayPath = [];
    const bounds = new google.maps.LatLngBounds();
    let hasAnyMarker = false;

    console.log("🔍 開始掃描行程天數...", currentTripData.days.length);

    currentTripData.days.forEach((day, dIdx) => {
        const isActiveDay = (dIdx === activeDayIndex);
        
        day.locations.forEach((loc, locIdx) => {
            const lat = loc.lat == null ? NaN : Number(loc.lat);
            const lng = loc.lng == null ? NaN : Number(loc.lng);

            if (isNaN(lat) || isNaN(lng)) {
                console.error(`❌ 地點「${loc.name}」的座標無效:`, loc.lat, loc.lng);
                return;
            }

            const pos = { lat, lng };
            hasAnyMarker = true;

            const marker = new google.maps.Marker({
                position: pos,
                map: map,
                title: loc.name,
                label: isActiveDay ? {
                    text: (locIdx + 1).toString(),
                    color: "white",
                    fontWeight: "bold"
                } : null,
                opacity: isActiveDay ? 1.0 : 0.4,
                zIndex: isActiveDay ? 100 : 10
            });

            markers.push(marker);
            
            if (isActiveDay) {
                activeDayPath.push(pos);
                bounds.extend(pos);
            }
        });
    });

    // 畫線邏輯
    if (activeDayPath.length > 1) {
        console.log(`🛣️ 正在為 Day ${activeDayIndex + 1} 畫線，點數:`, activeDayPath.length);
        polyline = new google.maps.Polyline({
            path: activeDayPath,
            geodesic: true,
            strokeColor: "#8a9a5b",
            strokeOpacity: 0.8,
            strokeWeight: 4,
            icons: [{
                icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW },
                offset: '100%',
                repeat: '80px'
            }],
            map: map
        });
    }

    // 自動縮放地圖
    if (hasAnyMarker && !bounds.isEmpty()) {
        console.log("📌 自動調整視角以包含所有標記");
        map.fitBounds(bounds);
        
        const listener = google.maps.event.addListener(map, "idle", function() {
            if (map.getZoom() > 17) map.setZoom(17);
            google.maps.event.removeListener(listener);
        });
    }
}

function startNavigation(lat, lng) { 
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank'); 
}

function focusLocation(lat, lng) { 
    if (!map) return;
    setPlannerView('map', false);
    map.panTo({ lat: parseFloat(lat), lng: parseFloat(lng) }); 
    map.setZoom(17); 
}

function setActiveDay(index) {
    activeDayIndex = index;
    if (tempMarker) { tempMarker.setMap(null); tempMarker = null; }
    infoWindow?.close();
    renderItinerary();
    renderMarkers();
    const activeButton = document.querySelector('.day-tab[aria-current="date"]');
    activeButton?.focus({ preventScroll: true });
    activeButton?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

async function addLocationToDB(locationObj) {
    try {
        const response = await apiFetch(`${API_URL}/api/trips/${tripId}/location`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dayIndex: activeDayIndex, location: locationObj })
        });
        
        if (response.ok) {
            currentTripData = await response.json();
            renderItinerary();
            renderMarkers();
        } else {
            alert("新增地點失敗");
        }
    } catch (e) {
        console.error("新增地點錯誤:", e);
        alert("網路錯誤");
    }
}

async function deleteLocation(dayIdx, locIdx) {
    if(!confirm("確定移除此地點嗎？")) return;
    
    try {
        const response = await apiFetch(`${API_URL}/api/trips/${tripId}/location/delete`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dayIndex: dayIdx, locationIndex: locIdx })
        });
        
        if(response.ok) {
            currentTripData = await response.json();
            renderItinerary();
            renderMarkers();
        } else {
            alert("刪除失敗");
        }
    } catch (e) {
        console.error("刪除地點錯誤:", e);
        alert("網路錯誤");
    }
}

async function handleReorder(dayIdx, oldIdx, newIdx) {
    try {
        const response = await apiFetch(`${API_URL}/api/trips/${tripId}/location/reorder`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dayIndex: dayIdx, oldIndex: oldIdx, newIndex: newIdx })
        });
        
        if(response.ok) {
            const result = await response.json();
            if (!result.trip) throw new Error('排序回應格式不正確');
            currentTripData = result.trip;
            renderItinerary();
            renderMarkers();
        } else {
            throw new Error(`排序失敗 (${response.status})`);
        }
    } catch (e) {
        console.error("重新排序錯誤:", e);
        renderItinerary();
        alert("排序失敗，已還原原本順序");
    }
}

// === 修正後的日期修改功能 ===
async function editTripDates() {
    if (!currentTripData) {
        alert("行程資料尚未載入");
        return;
    }
    
    console.log("📅 開始修改日期...");
    console.log("目前資料:", currentTripData);
    
    // 取得當前日期（移除時間部分）
    const currentStart = currentTripData.startDate.split('T')[0];
    const currentEnd = currentTripData.endDate.split('T')[0];
    
    console.log("目前開始日期:", currentStart);
    console.log("目前結束日期:", currentEnd);
    
    // 第一步：輸入新的開始日期
    const newStart = prompt(`📅 修改開始日期 (格式：YYYY-MM-DD)\n\n目前開始日期：${currentStart}`, currentStart);
    
    if (!newStart) {
        console.log("使用者取消輸入開始日期");
        return;
    }
    
    // 第二步：輸入新的結束日期
    const newEnd = prompt(`📅 修改結束日期 (格式：YYYY-MM-DD)\n\n目前結束日期：${currentEnd}`, currentEnd);
    
    if (!newEnd) {
        console.log("使用者取消輸入結束日期");
        return;
    }
    
    // 驗證日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newStart) || !dateRegex.test(newEnd)) {
        alert("❌ 日期格式錯誤！\n請使用 YYYY-MM-DD 格式\n例如：2025-03-15");
        return;
    }
    
    // 驗證日期邏輯
    if (new Date(newEnd) < new Date(newStart)) {
        alert("❌ 結束日期不能早於開始日期！");
        return;
    }
    
    console.log("新開始日期:", newStart);
    console.log("新結束日期:", newEnd);
    
    try {
        console.log("📤 發送 API 請求...");
        const response = await apiFetch(`${API_URL}/api/trips/${tripId}/dates`, {
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                startDate: newStart, 
                endDate: newEnd 
            })
        });
        
        console.log("📥 API 回應狀態:", response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("API 錯誤:", errorText);
            alert(`❌ 更新失敗 (${response.status})\n${errorText}`);
            return;
        }
        
        const result = await response.json();
        console.log("✅ API 回應成功:", result);
        
        if (result.trip) {
            currentTripData = result.trip;
            alert(`✅ 日期已成功更新！\n\n新日期：${newStart} ~ ${newEnd}\n總天數：${currentTripData.days.length} 天`);
            renderItinerary();
            renderMarkers();
        } else {
            alert("⚠️ 更新成功但資料格式異常，請重新整理頁面");
        }
        
    } catch (err) {
        console.error("❌ 修改日期失敗:", err);
        alert(`❌ 網路錯誤\n${err.message}\n\n請檢查網路連線或聯繫管理員`);
    }
}

async function deleteTrip() {
    if (!confirm(`⚠️ 確定刪除整個行程「${currentTripData.title}」嗎？\n\n此操作無法復原！`)) {
        return;
    }
    
    try {
        const response = await apiFetch(`${API_URL}/api/trips/${tripId}`, {
            method: 'DELETE' 
        });
        
        if (response.ok) {
            alert("✅ 行程已刪除");
            location.href = 'index.html';
        } else {
            alert("❌ 刪除失敗");
        }
    } catch (e) {
        console.error("刪除行程錯誤:", e);
        alert("❌ 網路錯誤");
    }
}

