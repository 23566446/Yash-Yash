const API_URL = 'https://yash-yash.onrender.com';
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
const userData = localStorage.getItem('yashyash_user');

if (!userData || !tripId) {
    window.location.href = 'index.html';
}

const currentUser = JSON.parse(userData);
let tripData = null;
let allPhotos = [];
let sortables = [];
let currentUploadDay = 0;
let tripExpired = false;

window.onload = async () => {
    const backBtn = document.getElementById('back-to-details');
    if (backBtn) backBtn.onclick = () => { window.location.href = `trip-details.html?id=${tripId}`; };

    try {
        const tripRes = await fetch(`${API_URL}/api/trips/${tripId}`);
        tripData = await tripRes.json();
        const today = new Date().toISOString().split('T')[0];
        const end = (tripData.endDate || '').split('T')[0];
        tripExpired = !!end && end < today;
        await loadPhotos();
    } catch (err) {
        console.error("初始化失敗", err);
    }
};

// --- 2. 載入照片資料 ---
async function loadPhotos() {
    try {
        const res = await fetch(`${API_URL}/api/trips/${tripId}/photos`);
        allPhotos = await res.json();
        renderAlbum();
    } catch (err) {
        console.error("載入照片失敗", err);
    }
}

// --- 3. 渲染相簿畫面 (日期分類) ---
function renderAlbum() {
    const wrapper = document.getElementById('days-album-wrapper');
    if (!wrapper || !tripData) return;

    wrapper.innerHTML = "";
    sortables.forEach(s => s.destroy());
    sortables = [];

    const startDate = new Date(tripData.startDate);

    for (let i = 0; i < tripData.days.length; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' });

        const dayPhotos = allPhotos.filter(p => p.dayIndex === i);
        
        const daySection = document.createElement('div');
        daySection.className = 'day-section';
        daySection.innerHTML = `
            <div class="day-header-wrapper" style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding:10px; border-bottom:1px solid var(--clay);">
                <div>
                    <span class="day-title" style="font-weight:bold; font-size:1.2rem;">Day ${i + 1}</span>
                    <span class="day-date" style="margin-left:10px; color:#888;">${dateStr}</span>
                </div>
                ${tripExpired ? '' : `<button class="btn-upload-day" onclick="openUpload(${i})" style="background:var(--accent-color); color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">＋ 上傳</button>`}
            </div>
            <div class="photo-grid" id="grid-day-${i}" data-day="${i}" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:5px; padding:10px; min-height:50px;">
                ${dayPhotos.map(p => `
                    <div class="photo-item" data-id="${p._id}" onclick="viewPhoto('${p._id}', '${p.imageData}', '${p.uploader}')" style="aspect-ratio:1; overflow:hidden; background:#eee;">
                        <img src="${p.imageData}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                `).join('')}
            </div>
        `;
        wrapper.appendChild(daySection);

        if (!tripExpired) {
            const el = document.getElementById(`grid-day-${i}`);
            sortables.push(new Sortable(el, {
                group: 'shared-album',
                animation: 150,
                onEnd: async (evt) => {
                    const targetDayIdx = parseInt(evt.to.getAttribute('data-day'));
                    await handleReorder(targetDayIdx, evt.to);
                    if (evt.from !== evt.to) {
                        const fromDayIdx = parseInt(evt.from.getAttribute('data-day'));
                        await handleReorder(fromDayIdx, evt.from);
                    }
                }
            }));
        }
    }
}

// --- 4. 上傳邏輯 (批量上傳) ---
function openUpload(dayIdx) {
    if (tripExpired) return;
    currentUploadDay = dayIdx;
    document.getElementById('photo-input').click();
}

async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    alert(`正在準備上傳 ${files.length} 張照片...`);

    for (const file of files) {
        if (file.size > 2 * 1024 * 1024) {
            console.warn(`跳過大檔案: ${file.name}`);
            continue;
        }

        const base64 = await toBase64(file);
        try {
            await fetch(`${API_URL}/api/trips/${tripId}/photos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uploader: currentUser.nickname,
                    imageData: base64,
                    dayIndex: currentUploadDay,
                    order: 999
                })
            });
        } catch (e) {
            console.error("上傳失敗", e);
        }
    }
    // 清空 input 讓同檔案可重複觸發
    event.target.value = "";
    loadPhotos();
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// --- 5. 預覽與刪除 (Lightbox) ---
function viewPhoto(id, src, uploader) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-img');
    const lbText = document.getElementById('lightbox-text');
    const delBtn = document.getElementById('btn-delete-photo');

    if (!lb || !lbImg) return;

    lbImg.src = src;
    lbText.innerText = `由 ${uploader} 分享`;
    lb.classList.remove('hidden');

    const isAdmin = (currentUser.account === 'admin');
    const isOwner = (uploader === currentUser.nickname);
    delBtn.style.display = (!tripExpired && (isAdmin || isOwner)) ? 'block' : 'none';
    
    delBtn.onclick = (e) => {
        e.stopPropagation();
        deletePhoto(id);
    };
}

// 修改後的 closeLightbox 函數
function closeLightbox() {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-img');
    if (lb) lb.classList.add('hidden');
    if (lbImg) lbImg.src = ""; // 關閉時清空圖片，釋放記憶體並防止下次開啟閃爍
}

async function deletePhoto(id) {
    if (!confirm("確定要刪除這張照片嗎？")) return;
    try {
        const res = await fetch(`${API_URL}/api/photos/${id}`, { method: 'DELETE' });
        if (res.ok) {
            closeLightbox();
            loadPhotos();
        }
    } catch (e) {
        alert("刪除失敗");
    }
}

// --- 6. 重新排序 API ---
async function handleReorder(dayIdx, gridElement) {
    const items = gridElement.querySelectorAll('.photo-item');
    const photoOrders = Array.from(items).map((item, index) => ({
        id: item.getAttribute('data-id'),
        dayIndex: dayIdx,
        order: index
    }));

    await fetch(`${API_URL}/api/photos/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoOrders })
    });
}

// --- 7. 打包下載 ---
async function downloadAllPhotos() {
    if (allPhotos.length === 0) return alert("相簿裡沒有照片可以下載");
    
    const zip = new JSZip();
    const folder = zip.folder(`${tripData.title}_相簿`);

    allPhotos.forEach((p, index) => {
        const base64Data = p.imageData.split(',')[1];
        folder.file(`Day${p.dayIndex + 1}_${index}.jpg`, base64Data, {base64: true});
    });

    try {
        const content = await zip.generateAsync({type:"blob"});
        saveAs(content, `${tripData.title}_旅行回憶.zip`);
    } catch (e) {
        alert("下載打包失敗");
    }
}