// trip-details.js - 行程詳情頁面
const API_URL = 'https://yash-yash.onrender.com';
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');

let currentUser = null;
let currentTrip = null;
let map, markers = [], polyline;

// ===== 初始化 =====
window.onload = async function() {
    const user = JSON.parse(localStorage.getItem('yashyash_user'));
    if (!user) {
        location.href = 'login.html';
        return;
    }
    currentUser = user;
    
    await loadTripDetails();
    initMap();
};

// ===== 載入行程詳情 =====
async function loadTripDetails() {
    try {
        const res = await fetch(`${API_URL}/api/trips/${tripId}`);
        currentTrip = await res.json();
        
        // 更新標題
        document.getElementById('trip-title').innerText = currentTrip.title;
        
        // 檢查是否為創建者，顯示編輯按鈕
        if (currentTrip.creator === currentUser.nickname) {
            document.getElementById('edit-date-btn').classList.remove('hidden');
            document.getElementById('delete-trip-btn').classList.remove('hidden');
        }
        
        // 渲染每日行程
        renderDays();
        
    } catch (e) {
        console.error("載入行程失敗:", e);
        alert("載入行程失敗，請重新整理頁面");
    }
}

// ===== 渲染每日行程列表 =====
function renderDays() {
    const container = document.getElementById('days-container');
    
    if (!currentTrip.days || currentTrip.days.length === 0) {
        container.innerHTML = '<p class="empty-text">尚未安排行程</p>';
        return;
    }
    
    container.innerHTML = currentTrip.days.map((day, dayIndex) => {
        const date = new Date(currentTrip.startDate);
        date.setDate(date.getDate() + dayIndex);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
        
        return `
            <div class="day-section" style="margin-bottom: 25px; background: white; border-radius: 12px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid var(--bg-color); padding-bottom: 10px;">
                    <h3 style="margin: 0; color: var(--accent-color); font-size: 1.1rem;">
                        Day ${day.dayNumber} <span style="font-size: 0.85rem; color: #888; font-weight: normal;">${dateStr}</span>
                    </h3>
                    <button onclick="promptAddLocation(${dayIndex})" class="btn-small" style="background: var(--accent-color); color: white; border: none; font-size: 0.8rem;">
                        + 新增景點
                    </button>
                </div>
                
                <div id="locations-day-${dayIndex}" class="locations-list" style="min-height: 50px;">
                    ${day.locations.length === 0 ? 
                        '<p style="text-align: center; color: #999; font-size: 0.85rem; padding: 20px 0;">尚未新增景點</p>' :
                        day.locations.map((loc, locIndex) => `
                            <div class="location-item" data-day="${dayIndex}" data-index="${locIndex}" style="padding: 12px; margin-bottom: 10px; background: var(--bg-color); border-radius: 8px; border-left: 3px solid var(--clay); cursor: move;">
                                <div style="display: flex; justify-content: space-between; align-items: start;">
                                    <div style="flex: 1;">
                                        <strong style="color: var(--text-color); font-size: 0.95rem;">${loc.name || '未命名地點'}</strong>
                                        ${loc.time ? `<div style="font-size: 0.75rem; color: #888; margin-top: 3px;">⏰ ${loc.time}</div>` : ''}
                                        ${loc.note ? `<div style="font-size: 0.8rem; color: #666; margin-top: 5px;">📝 ${loc.note}</div>` : ''}
                                    </div>
                                    <button onclick="deleteLocation(${dayIndex}, ${locIndex})" class="btn-small" style="color: var(--danger); border-color: var(--danger); font-size: 0.7rem; padding: 4px 8px;">
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
        `;
    }).join('');
    
    // 初始化拖曳排序
    initSortable();
    
    // 更新地圖標記
    updateMapMarkers();
}

// ===== 初始化拖曳排序 =====
function initSortable() {
    document.querySelectorAll('.locations-list').forEach(list => {
        new Sortable(list, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: async function(evt) {
                const dayIndex = parseInt(evt.item.dataset.day);
                const oldIndex = evt.oldIndex;
                const newIndex = evt.newIndex;
                
                if (oldIndex !== newIndex) {
                    // 重新排序後端資料
                    const day = currentTrip.days[dayIndex];
                    const [movedItem] = day.locations.splice(oldIndex, 1);
                    day.locations.splice(newIndex, 0, movedItem);
                    
                    // 同步到後端（這裡可以加上 API 更新）
                    console.log("景點順序已更新");
                }
            }
        });
    });
}

// ===== 修改行程日期功能（核心修正） =====
async function editTripDates() {
    if (!currentTrip) {
        alert("行程資料尚未載入");
        return;
    }
    
    // 顯示當前日期
    const currentStart = currentTrip.startDate.split('T')[0];
    const currentEnd = currentTrip.endDate.split('T')[0];
    
    const newStart = prompt(`修改開始日期 (YYYY-MM-DD)\n目前：${currentStart}`, currentStart);
    if (!newStart) return;
    
    const newEnd = prompt(`修改結束日期 (YYYY-MM-DD)\n目前：${currentEnd}`, currentEnd);
    if (!newEnd) return;
    
    // 驗證日期
    if (new Date(newEnd) < new Date(newStart)) {
        alert("❌ 結束日期不能早於開始日期！");
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/api/trips/${tripId}/dates`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDate: newStart,
                endDate: newEnd
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            alert("✅ 日期已成功更新！");
            
            // 重新載入行程
            await loadTripDetails();
        } else {
            const error = await res.json();
            alert("❌ 更新失敗：" + error.message);
        }
        
    } catch (e) {
        console.error("修改日期失敗:", e);
        alert("❌ 網路錯誤，請稍後再試");
    }
}

// ===== 刪除行程 =====
async function deleteTrip() {
    if (!confirm(`⚠️ 確定要刪除「${currentTrip.title}」嗎？\n此操作無法復原！`)) {
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/api/trips/${tripId}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            alert("✅ 行程已刪除");
            location.href = 'index.html';
        } else {
            alert("❌ 刪除失敗");
        }
    } catch (e) {
        alert("❌ 網路錯誤");
    }
}

// ===== 新增景點（提示輸入） =====
function promptAddLocation(dayIndex) {
    const name = prompt("請輸入景點名稱：");
    if (!name) return;
    
    const time = prompt("預計時間（選填，例如：14:00）：");
    const note = prompt("備註（選填）：");
    
    addLocation(dayIndex, {
        name,
        time: time || '',
        note: note || '',
        addr: '',
        lat: null,
        lng: null
    });
}

// ===== 新增景點到後端 =====
async function addLocation(dayIndex, location) {
    try {
        const res = await fetch(`${API_URL}/api/trips/${tripId}/location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dayIndex, location })
        });
        
        if (res.ok) {
            currentTrip = await res.json();
            renderDays();
        }
    } catch (e) {
        alert("新增失敗");
    }
}

// ===== 刪除景點 =====
async function deleteLocation(dayIndex, locationIndex) {
    if (!confirm("確定要刪除此景點嗎？")) return;
    
    try {
        const res = await fetch(`${API_URL}/api/trips/${tripId}/location/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dayIndex, locationIndex })
        });
        
        if (res.ok) {
            currentTrip = await res.json();
            renderDays();
        }
    } catch (e) {
        alert("刪除失敗");
    }
}

// ===== 初始化地圖 =====
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 25.033, lng: 121.5654 },
        zoom: 13
    });
    
    // 搜尋框
    const input = document.getElementById('pac-input');
    const searchBox = new google.maps.places.SearchBox(input);
    
    searchBox.addListener('places_changed', function() {
        const places = searchBox.getPlaces();
        if (places.length === 0) return;
        
        const place = places[0];
        const name = place.name;
        const addr = place.formatted_address;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        
        // 詢問要加到哪一天
        const dayIndex = prompt(`將「${name}」加入第幾天？(輸入數字)`);
        if (dayIndex && parseInt(dayIndex) > 0 && parseInt(dayIndex) <= currentTrip.days.length) {
            addLocation(parseInt(dayIndex) - 1, { name, addr, lat, lng, time: '', note: '' });
        }
    });
}

// ===== 更新地圖標記 =====
function updateMapMarkers() {
    // 清除舊標記
    markers.forEach(m => m.setMap(null));
    markers = [];
    
    if (polyline) polyline.setMap(null);
    
    // 收集所有有座標的景點
    const allLocations = [];
    currentTrip.days.forEach(day => {
        day.locations.forEach(loc => {
            if (loc.lat && loc.lng) {
                allLocations.push(loc);
            }
        });
    });
    
    // 建立標記
    allLocations.forEach((loc, index) => {
        const marker = new google.maps.Marker({
            position: { lat: loc.lat, lng: loc.lng },
            map: map,
            label: (index + 1).toString(),
            title: loc.name
        });
        markers.push(marker);
    });
    
    // 畫路徑
    if (allLocations.length > 1) {
        const path = allLocations.map(loc => ({ lat: loc.lat, lng: loc.lng }));
        polyline = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: '#8a9a5b',
            strokeOpacity: 0.8,
            strokeWeight: 3,
            map: map
        });
    }
    
    // 調整視野
    if (allLocations.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        allLocations.forEach(loc => bounds.extend({ lat: loc.lat, lng: loc.lng }));
        map.fitBounds(bounds);
    }
}
