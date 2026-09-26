const API_URL = window.YashYashConfig.API_URL;
const urlParams = new URLSearchParams(window.location.search);
const tripId = urlParams.get('id');
let currentUser = null;
let tripData = null;
let allPhotos = [];
let sortables = [];
let currentUploadDay = 0;
let currentLightboxPhotoId = null;
let isUploadingPhotos = false;
function denyAccess() { alert('你沒有權限存取這個內容'); window.location.href = 'index.html'; }

window.onload = async () => {
    currentUser = await window.YashYashSession.ready;
    if (!tripId) return window.location.href = 'index.html';
    const backBtn = document.getElementById('back-to-details');
    if (backBtn) backBtn.addEventListener('click', () => { window.location.href = `trip-details.html?id=${encodeURIComponent(tripId)}`; });
    const deleteButton = document.getElementById('btn-delete-photo');
    if (deleteButton) deleteButton.addEventListener('click', event => {
        event.stopPropagation();
        if (currentLightboxPhotoId) deletePhoto(currentLightboxPhotoId);
    });

    try {
        const tripRes = await apiFetch(`${API_URL}/api/trips/${tripId}`);
        if (tripRes.status === 403) return denyAccess();
        if (!tripRes.ok) throw new Error('載入行程失敗');
        tripData = await tripRes.json();
        await loadPhotos();
    } catch (err) {
        console.error("初始化失敗", err);
    }
};

// --- 2. 載入照片資料 ---
async function loadPhotos() {
    try {
        const res = await apiFetch(`${API_URL}/api/trips/${tripId}/photos`);
        if (res.status === 403) return denyAccess();
        if (!res.ok) throw new Error('載入照片失敗');
        const photos = await res.json().catch(() => null);
        allPhotos = Array.isArray(photos) ? photos : [];
        if (!Array.isArray(photos)) console.error('照片資料格式錯誤');
        renderAlbum();
    } catch (err) {
        console.error("載入照片失敗", err);
    }
}

// --- 3. 渲染相簿畫面 (日期分類) ---
function renderAlbum() {
    const wrapper = document.getElementById('days-album-wrapper');
    if (!wrapper || !tripData) return;

    wrapper.replaceChildren();
    sortables.forEach(s => s.destroy ? s.destroy() : null);
    sortables = [];

    const startDate = new Date(tripData.startDate);

    const days = Array.isArray(tripData.days) ? tripData.days : [];
    for (let i = 0; i < days.length; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' });

        const dayPhotos = allPhotos.filter(p => p.dayIndex === i);
        
        const daySection = document.createElement('div');
        daySection.className = 'day-section';
        const header = document.createElement('div');
        header.className = 'day-header-wrapper';
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding:10px; border-bottom:1px solid var(--clay);';
        const labels = document.createElement('div');
        const title = document.createElement('span'); title.className = 'day-title'; title.style.cssText = 'font-weight:bold; font-size:1.2rem;'; title.textContent = `Day ${i + 1}`;
        const date = document.createElement('span'); date.className = 'day-date'; date.style.cssText = 'margin-left:10px; color:#888;'; date.textContent = dateStr;
        labels.append(title, date);
        const uploadButton = document.createElement('button'); uploadButton.className = 'btn-upload-day'; uploadButton.style.cssText = 'background:var(--accent-color); color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;'; uploadButton.textContent = '＋ 上傳'; uploadButton.disabled = isUploadingPhotos; uploadButton.addEventListener('click', () => openUpload(i));
        header.append(labels, uploadButton);
        const grid = document.createElement('div');
        grid.className = 'photo-grid'; grid.id = `grid-day-${i}`; grid.dataset.day = String(i); grid.style.cssText = 'display:grid; grid-template-columns:repeat(3, 1fr); gap:5px; padding:10px; min-height:50px;';
        dayPhotos.forEach(photo => {
            const photoItem = document.createElement('div'); photoItem.className = 'photo-item'; photoItem.dataset.id = String(photo._id); photoItem.style.cssText = 'aspect-ratio:1; overflow:hidden; background:#eee;';
            const img = document.createElement('img'); img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
            const safeSrc = window.safeImageSource(photo.imageData, ''); if (safeSrc) img.src = safeSrc;
            photoItem.addEventListener('click', () => viewPhoto(photo._id));
            photoItem.appendChild(img); grid.appendChild(photoItem);
        });
        daySection.append(header, grid);
        wrapper.appendChild(daySection);

        const el = document.getElementById(`grid-day-${i}`);
        sortables.push(new Sortable(el, {
            group: 'shared-album',
            animation: 150,
            onEnd: async (evt) => {
                try {
                    const targetDayIdx = parseInt(evt.to.getAttribute('data-day'));
                    await handleReorder(targetDayIdx, evt.to);
                    if (evt.from !== evt.to) {
                        const fromDayIdx = parseInt(evt.from.getAttribute('data-day'));
                        await handleReorder(fromDayIdx, evt.from);
                    }
                } catch (error) {
                    console.error('照片排序失敗:', error);
                    await loadPhotos();
                    alert('照片排序失敗，已還原目前儲存的順序');
                }
            }
        }));
    }
}

// --- 4. 上傳邏輯 (批量上傳) ---
function openUpload(dayIdx) {
    if (isUploadingPhotos) return;
    currentUploadDay = dayIdx;
    document.getElementById('photo-input').click();
}

async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0 || isUploadingPhotos) return;

    const uploadDay = currentUploadDay;
    const baseOrder = window.YashYashPhotoUtils.nextPhotoBaseOrder(allPhotos, uploadDay);
    const status = document.getElementById('upload-status');
    let completed = 0;
    isUploadingPhotos = true;
    document.querySelectorAll('.btn-upload-day').forEach(button => { button.disabled = true; });
    status.classList.remove('hidden');
    status.textContent = `正在處理 / 上傳照片 0 / ${files.length}`;

    try {
        const results = await window.YashYashPhotoUtils.runBounded(files, async (file, index) => {
            const imageData = await window.YashYashPhotoUtils.preprocessPhoto(file);
            const response = await apiFetch(`${API_URL}/api/trips/${encodeURIComponent(tripId)}/photos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageData, dayIndex: uploadDay, order: baseOrder + index })
            });
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.message || '伺服器拒絕照片資料');
            }
        }, 3, () => {
            completed++;
            status.textContent = `正在處理 / 上傳照片 ${completed} / ${files.length}`;
        });

        results.forEach((result, index) => {
            if (result.status === 'rejected') window.showToast?.(`${files[index].name}：${result.reason?.message || '圖片處理失敗'}`, 'error', 5500);
        });
        await loadPhotos();
        const failures = results.filter(result => result.status === 'rejected').length;
        window.showToast?.(failures ? `${files.length - failures} 張完成，${failures} 張失敗` : '照片上傳完成', failures ? 'error' : 'info');
    } finally {
        event.target.value = '';
        isUploadingPhotos = false;
        document.querySelectorAll('.btn-upload-day').forEach(button => { button.disabled = false; });
        status.classList.add('hidden');
    }
}

// --- 5. 預覽與刪除 (Lightbox) ---
function viewPhoto(id) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-img');
    const lbText = document.getElementById('lightbox-text');
    const delBtn = document.getElementById('btn-delete-photo');

    const photo = allPhotos.find(p => p._id === id);
    if (!lb || !lbImg || !photo) return;

    const safeSrc = window.safeImageSource(photo.imageData, '');
    lbImg.src = safeSrc;
    lbText.textContent = `由 ${photo.uploader} 分享`;
    lb.classList.remove('hidden');

    currentLightboxPhotoId = id;
    const isAdmin = currentUser.role === 'admin';
    const isOwner = photo?.uploaderAccount === currentUser.account;
    const isCreator = tripData?.creatorAccount === currentUser.account;
    delBtn.style.display = (isAdmin || isOwner || isCreator) ? 'block' : 'none';
    
}

// 修改後的 closeLightbox 函數
function closeLightbox() {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-img');
    if (lb) lb.classList.add('hidden');
    if (lbImg) lbImg.src = ""; // 關閉時清空圖片，釋放記憶體並防止下次開啟閃爍
    currentLightboxPhotoId = null;
}

async function deletePhoto(id) {
    if (!confirm("確定要刪除這張照片嗎？")) return;
    try {
        const res = await apiFetch(`${API_URL}/api/photos/${id}`, { method: 'DELETE' });
        if (res.ok) {
            closeLightbox();
            loadPhotos();
        } else {
            alert("刪除失敗");
        }
    } catch (e) {
        alert("刪除失敗");
    }
}

// --- 6. 重新排序 API ---
async function handleReorder(dayIdx, gridElement) {
    const items = gridElement.querySelectorAll('.photo-item');
    const photoOrders = Array.from(items).map((item, index) => ({
        id: item.dataset.id,
        dayIndex: dayIdx,
        order: index
    }));

    const response = await apiFetch(`${API_URL}/api/photos/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoOrders })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

