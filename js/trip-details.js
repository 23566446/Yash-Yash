const API_URL = 'https://yash-yash.onrender.com';
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');

let map, searchBox, markers = [];
let currentTripData = null;
let activeDayIndex = 0; 
let sortables = []; 

window.onload = async () => {
    if (!tripId) return alert("找不到行程 ID");
    await fetchTripDetails();
    initMap();
};

async function fetchTripDetails() {
    try {
        const response = await fetch(`${API_URL}/api/trips/${tripId}`);
        currentTripData = await response.json();
        if (!currentTripData) throw new Error("資料為空");
        
        document.getElementById('trip-title').innerText = currentTripData.title;
        renderItinerary();
    } catch (err) {
        console.error("載入失敗:", err);
        document.getElementById('days-container').innerHTML = "<p>行程資料載入錯誤</p>";
    }
}

function renderItinerary() {
    const container = document.getElementById('days-container');
    if (!container || !currentTripData) return;

    // 清除舊的拖拽實體
    sortables.forEach(s => s.destroy());
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
                                <div class="location-item" style="background:#fff; border:1px solid #eee; padding:10px; margin:5px 0; display:flex; align-items:center; border-radius:5px;">
                                    <span class="drag-handle" style="margin-right:10px; cursor:grab; color:#ccc;">☰</span>
                                    <div style="flex:1;">
                                        <div style="font-size:0.9rem; font-weight:bold;">${loc.name}</div>
                                    </div>
                                    <button onclick="event.stopPropagation(); deleteLocation(${index}, ${locIdx})" style="padding:2px 8px; background:none; border:none; color:#ccc; cursor:pointer;">×</button>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // 安全檢查：確定有 Sortable 庫才執行
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

function setActiveDay(index) {
    activeDayIndex = index;
    renderItinerary();
}

function initMap() {
    const mapEl = document.getElementById("map");
    if (!mapEl) return;

    map = new google.maps.Map(mapEl, {
        center: { lat: 25.0339, lng: 121.5644 },
        zoom: 13,
    });

    const input = document.getElementById("pac-input");
    searchBox = new google.maps.places.SearchBox(input);

    searchBox.addListener("places_changed", () => {
        const places = searchBox.getPlaces();
        if (places.length == 0) return;
        const place = places[0];
        if (!place.geometry) return;

        addLocationToDB({
            name: place.name,
            addr: place.formatted_address || "",
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng()
        });
        input.value = "";
    });
}

async function addLocationToDB(locationObj) {
    const response = await fetch(`${API_URL}/api/trips/${tripId}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayIndex: activeDayIndex, location: locationObj })
    });
    if (response.ok) {
        currentTripData = await response.json();
        renderItinerary();
    }
}

async function deleteLocation(dayIdx, locIdx) {
    if(!confirm("確定移除？")) return;
    const response = await fetch(`${API_URL}/api/trips/${tripId}/location/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayIndex: dayIdx, locationIndex: locIdx })
    });
    if(response.ok) {
        currentTripData = await response.json();
        renderItinerary();
    }
}

async function handleReorder(dayIdx, oldIdx, newIdx) {
    await fetch(`${API_URL}/api/trips/${tripId}/location/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayIndex: dayIdx, oldIndex: oldIdx, newIndex: newIdx })
    });
}

// 修改行程日期
async function editTripDates() {
    const newStart = prompt("請輸入新的開始日期 (YYYY-MM-DD):", currentTripData.startDate);
    if (!newStart) return;
    const newEnd = prompt("請輸入新的結束日期 (YYYY-MM-DD):", currentTripData.endDate);
    if (!newEnd) return;

    // 簡單的天數檢查提示
    const d1 = new Date(newStart);
    const d2 = new Date(newEnd);
    const newCount = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    const oldCount = currentTripData.days.length;

    if (newCount < oldCount) {
        const confirmReduce = confirm(`注意：縮短行程將會「刪除」最後 ${oldCount - newCount} 天的內容，確定要繼續嗎？`);
        if (!confirmReduce) return;
    }

    try {
        const response = await fetch(`${API_URL}/api/trips/${tripId}/dates`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: newStart, endDate: newEnd })
        });

        const result = await response.json();

        if (response.ok) {
            alert("✅ 行程天數已成功調整！");
            // 重點：同步更新資料並重新渲染畫面
            currentTripData = result.trip; 
            renderItinerary(); 
        } else {
            alert("錯誤：" + result.message);
        }
    } catch (err) {
        alert("網路連線失敗");
    }

}
