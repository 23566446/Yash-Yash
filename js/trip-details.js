const API_URL = 'https://yash-yash.onrender.com';
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');

let map, searchBox, markers = [];
let currentTripData = null;
let activeDayIndex = 0; 
let sortables = []; 

// 地圖輔助變數
let tempMarker = null;
let infoWindow = new google.maps.InfoWindow();
let geocoder = new google.maps.Geocoder();
let placesService;
let polyline = null; 

// --- 1. 修正：保證嚴格的執行順序 ---
window.onload = async () => {
    if (!tripId) return alert("找不到行程 ID");
    
    // 第一步：先抓資料
    await fetchTripDetails(); 
    
    // 第二步：資料抓完後，才初始化地圖
    initMap(); 
};

async function fetchTripDetails() {
    try {
        const response = await fetch(`${API_URL}/api/trips/${tripId}`);
        currentTripData = await response.json();
        
        document.getElementById('trip-title').innerText = currentTripData.title;
        
        // 權限判斷
        const user = JSON.parse(localStorage.getItem('yashyash_user'));
        const isOwner = currentTripData.creator === user.nickname;
        const isAdmin = user.account === 'admin';

        if (isOwner || isAdmin) {
            document.getElementById('edit-date-btn').classList.remove('hidden');
            document.getElementById('delete-trip-btn').classList.remove('hidden');
        }

        renderItinerary();
        // 注意：這裡移除了原本的 renderMarkers，改放到 initMap 最後執行
    } catch (err) {
        console.error("載入詳情失敗:", err);
    }
}

// ... (中間的 renderItinerary 保持不變) ...
function renderItinerary() {
    const container = document.getElementById('days-container');
    if (!container || !currentTripData) return;

    sortables.forEach(s => s.destroy ? s.destroy() : null);
    sortables = [];

    container.innerHTML = currentTripData.days.map((day, index) => {
        const isActive = activeDayIndex === index;
        return `
            <div class="day-card wabi-card ${isActive ? 'active-day' : ''}" style="margin-bottom:15px; cursor:pointer; border:${isActive?'2px solid #8a9a5b':'1px solid #e0ddd7'}">
                <div class="day-header" onclick="setActiveDay(${index})" style="padding:15px; display:flex; justify-content:space-between; align-items:center;">
                    <h4 style="margin:0;">Day ${day.dayNumber} ${isActive ? '📍' : ''}</h4>
                    <span>${isActive ? '▼' : '▶'}</span>
                </div>
                <div class="day-content" style="display:${isActive ? 'block' : 'none'}; padding:0 15px 15px 15px; background:#f9f9f7;">
                    <div class="location-list" id="list-${index}" style="min-height:20px;">
                        ${day.locations.length === 0 ? '<p class="empty-text" style="font-size:0.8rem; color:#999;">尚未新增地點</p>' : 
                            day.locations.map((loc, locIdx) => `
                                <div class="location-item" 
                                     onclick="focusLocation(${loc.lat}, ${loc.lng})"
                                     style="background:#fff; border:1px solid #eee; padding:10px; margin:5px 0; display:flex; align-items:center; border-radius:5px; cursor:pointer;">
                                    <span class="drag-handle" style="margin-right:10px; cursor:grab; color:#ccc;" onclick="event.stopPropagation()">☰</span>
                                    <div style="flex:1; overflow:hidden;">
                                        <div style="font-size:0.9rem; font-weight:bold; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${loc.name}</div>
                                    </div>
                                    <div style="display:flex; gap:5px;">
                                        <button onclick="event.stopPropagation(); startNavigation(${loc.lat}, ${loc.lng})" 
                                                style="padding:4px 8px; background:#f5f2ed; border:1px solid #d2b48c; border-radius:4px; cursor:pointer;">🚗</button>
                                        <button onclick="event.stopPropagation(); deleteLocation(${index}, ${locIdx})" 
                                                style="padding:4px 8px; background:none; border:none; color:#ccc; cursor:pointer;">×</button>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (typeof Sortable !== 'undefined') {
        currentTripData.days.forEach((_, index) => {
            const el = document.getElementById(`list-${index}`);
            if (el) {
                const s = new Sortable(el, {
                    animation: 150,
                    handle: '.drag-handle',
                    onEnd: (evt) => handleReorder(index, evt.oldIndex, evt.newIndex)
                });
                sortables.push(s);
            }
        });
    }
}

// ... (中間的 showPreview, findNearbyPlace 保持不變) ...
function initMap() {
    const mapEl = document.getElementById("map");
    if (!mapEl) return;

    map = new google.maps.Map(mapEl, {
        center: { lat: 25.0339, lng: 121.5644 },
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        clickableIcons: true
    });

    placesService = new google.maps.places.PlacesService(map);
    const input = document.getElementById("pac-input");
    searchBox = new google.maps.places.SearchBox(input);

    searchBox.addListener("places_changed", () => {
        const places = searchBox.getPlaces();
        if (places.length == 0) return;
        const place = places[0];
        if (!place.geometry) return;

        showPreview(place.geometry.location, place.name, place.formatted_address || "");
        map.panTo(place.geometry.location);
        map.setZoom(17);
        input.value = ""; 
    });

    map.addListener("click", (e) => {
        if (e.placeId) {
            e.stop();
            placesService.getDetails({ placeId: e.placeId }, (place, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK) {
                    showPreview(e.latLng, place.name, place.formatted_address);
                }
            });
        } else {
            findNearbyPlace(e.latLng);
        }
    });

    // 關鍵：地圖閒置後執行
    google.maps.event.addListenerOnce(map, 'idle', () => {
        console.log("地圖核心已就緒 (idle)");
        if (currentTripData) {
            renderMarkers();
        }
    });
}

function findNearbyPlace(latLng) {
    const request = { location: latLng, radius: '20', rankBy: google.maps.places.RankBy.PROMINENCE };
    placesService.nearbySearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
            showPreview(latLng, results[0].name, results[0].vicinity || "選定地點");
        } else {
            geocoder.geocode({ location: latLng }, (results, status) => {
                if (status === "OK" && results[0]) {
                    const simplifiedName = results[0].address_components[0].long_name;
                    showPreview(latLng, simplifiedName, results[0].formatted_address);
                }
            });
        }
    });
}

function showPreview(latLng, name, address) {
    if (tempMarker) tempMarker.setMap(null);

    tempMarker = new google.maps.Marker({
        position: latLng,
        map: map,
        icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
        animation: google.maps.Animation.DROP
    });

    const safeName = name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safeAddr = address.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    const contentString = `
        <div style="padding:10px; font-family:sans-serif; max-width:200px;">
            <strong style="font-size:14px; display:block; margin-bottom:5px;">${name}</strong>
            <span style="font-size:11px; color:#666; display:block; margin-bottom:10px;">${address}</span>
            <button onclick="confirmAdd('${safeName}', '${safeAddr}', ${latLng.lat()}, ${latLng.lng()})" 
                style="background:#8a9a5b; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; width:100%; font-weight:bold;">
                確認加入 Day ${activeDayIndex + 1}
            </button>
        </div>
    `;

    infoWindow.setContent(contentString);
    infoWindow.open(map, tempMarker);
}

async function confirmAdd(name, addr, lat, lng) {
    // 強制轉換為數字，確保存入資料庫前不是字串
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

// --- 3. 修正：強化穩定性的 renderMarkers ---
function renderMarkers() {
    if (!map || !currentTripData) {
        console.error("❌ 渲染失敗：map 或 currentTripData 未準備好");
        return;
    }

    // 1. 清除舊標記與線段
    markers.forEach(m => m.setMap(null));
    markers = [];
    if (polyline) { polyline.setMap(null); polyline = null; }

    const activeDayPath = [];
    const bounds = new google.maps.LatLngBounds(); // 用於自動縮放地圖
    let hasAnyMarker = false;

    console.log("🔍 開始掃描行程天數...", currentTripData.days.length);

    currentTripData.days.forEach((day, dIdx) => {
        const isActiveDay = (dIdx === activeDayIndex);
        
        day.locations.forEach((loc, locIdx) => {
            // 確保座標是正確的數字數字類型
            const lat = parseFloat(loc.lat);
            const lng = parseFloat(loc.lng);

            if (isNaN(lat) || isNaN(lng)) {
                console.error(`❌ 地點「${loc.name}」的座標無效:`, loc.lat, loc.lng);
                return;
            }

            const pos = { lat, lng };
            hasAnyMarker = true;

            // 建立標記
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
                zIndex: isActiveDay ? 100 : 10 // 讓當前天數的地點疊在上面
            });

            markers.push(marker);
            
            if (isActiveDay) {
                activeDayPath.push(pos);
                bounds.extend(pos); // 將座標加入縮放範圍
            }
        });
    });

    // 2. 畫線邏輯
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
            map: map // 直接設定 map
        });
    }

    // 3. 自動縮放地圖以看見所有點
    if (hasAnyMarker && !bounds.isEmpty()) {
        console.log("📌 自動調整視角以包含所有標記");
        map.fitBounds(bounds);
        
        // 如果點太近，避免過度放大
        const listener = google.maps.event.addListener(map, "idle", function() {
            if (map.getZoom() > 17) map.setZoom(17);
            google.maps.event.removeListener(listener);
        });
    } else {
        console.warn("⚠️ 本天行程沒有有效地點，無法畫線或調整視角");
    }
}

// ... (其餘 deleteTrip, addLocationToDB 等函數保持不變) ...
function startNavigation(lat, lng) { window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank'); }
function focusLocation(lat, lng) { map.panTo({ lat: parseFloat(lat), lng: parseFloat(lng) }); map.setZoom(17); }

function setActiveDay(index) {
    activeDayIndex = index;
    renderItinerary();
    renderMarkers();
}

async function addLocationToDB(locationObj) {
    const response = await fetch(`${API_URL}/api/trips/${tripId}/location`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayIndex: activeDayIndex, location: locationObj })
    });
    if (response.ok) {
        currentTripData = await response.json();
        renderItinerary();
        renderMarkers();
    }
}

async function deleteLocation(dayIdx, locIdx) {
    if(!confirm("確定移除？")) return;
    const response = await fetch(`${API_URL}/api/trips/${tripId}/location/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayIndex: dayIdx, locationIndex: locIdx })
    });
    if(response.ok) {
        currentTripData = await response.json();
        renderItinerary();
        renderMarkers();
    }
}

async function handleReorder(dayIdx, oldIdx, newIdx) {
    const response = await fetch(`${API_URL}/api/trips/${tripId}/location/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayIndex: dayIdx, oldIndex: oldIdx, newIndex: newIdx })
    });
    if(response.ok) {
        currentTripData = await response.json();
        renderMarkers();
    }
}

async function editTripDates() {
    const newStart = prompt("開始日期:", currentTripData.startDate);
    const newEnd = prompt("結束日期:", currentTripData.endDate);
    if (!newStart || !newEnd) return;
    const response = await fetch(`${API_URL}/api/trips/${tripId}/dates`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: newStart, endDate: newEnd })
    });
    const result = await response.json();
    if (response.ok) {
        currentTripData = result.trip; 
        renderItinerary(); 
        renderMarkers();
    }
}

async function deleteTrip() {
    if (!confirm("確定刪除整個行程？")) return;
    const response = await fetch(`${API_URL}/api/trips/${tripId}`, { method: 'DELETE' });
    if (response.ok) location.href = 'index.html';
}
