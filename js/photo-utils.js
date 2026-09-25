(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.YashYashPhotoUtils = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    const MAX_CONCURRENCY = 3;
    const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
    const MAX_DATA_URL_LENGTH = Math.floor(2.5 * 1024 * 1024);
    const MAX_EDGE = 1920;
    const RASTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif']);

    async function runBounded(items, worker, limit = MAX_CONCURRENCY, onSettled) {
        const results = new Array(items.length);
        let nextIndex = 0;
        const workerCount = Math.min(Math.max(1, limit), items.length);

        async function consume() {
            while (nextIndex < items.length) {
                const index = nextIndex++;
                try {
                    results[index] = { status: 'fulfilled', value: await worker(items[index], index) };
                } catch (reason) {
                    results[index] = { status: 'rejected', reason };
                }
                onSettled?.(results[index], index);
            }
        }

        await Promise.all(Array.from({ length: workerCount }, consume));
        return results;
    }

    function isDataUrlWithinLimit(value, maxLength = MAX_DATA_URL_LENGTH) {
        return typeof value === 'string' && value.length <= maxLength;
    }

    function readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('圖片讀取失敗'));
            reader.readAsDataURL(file);
        });
    }

    function normalizedType(file) {
        const type = (file.type || '').toLowerCase();
        if (RASTER_TYPES.has(type)) return type;
        const extension = file.name?.split('.').pop()?.toLowerCase();
        return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif' })[extension] || '';
    }

    async function decodeImage(file) {
        if (typeof createImageBitmap === 'function') return createImageBitmap(file);
        const url = URL.createObjectURL(file);
        try {
            return await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('圖片格式無法處理'));
                image.src = url;
            });
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    function renderDataUrl(source, width, height, quality, preferTransparency) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('圖片處理失敗');
        context.drawImage(source, 0, 0, width, height);
        const webp = canvas.toDataURL('image/webp', quality);
        if (webp.startsWith('data:image/webp')) return webp;
        return canvas.toDataURL(preferTransparency ? 'image/png' : 'image/jpeg', quality);
    }

    async function preprocessPhoto(file) {
        const type = normalizedType(file);
        if (!type) throw new Error('不支援的圖片格式');
        if (file.size > MAX_ORIGINAL_BYTES) throw new Error('原始檔案超過 25 MB');

        const original = await readAsDataURL(file);
        if (type === 'image/gif') {
            if (!isDataUrlWithinLimit(original)) throw new Error('GIF 過大，為保留動畫未壓縮');
            return original;
        }
        if (isDataUrlWithinLimit(original) && file.size <= 1.5 * 1024 * 1024) return original;

        let source;
        try {
            source = await decodeImage(file);
        } catch (error) {
            if (isDataUrlWithinLimit(original)) return original;
            throw new Error('圖片格式無法處理或壓縮');
        }

        try {
            const sourceWidth = source.width;
            const sourceHeight = source.height;
            const initialScale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
            const qualities = [0.84, 0.74, 0.64, 0.54];
            for (let attempt = 0; attempt < qualities.length; attempt++) {
                const scale = initialScale * Math.pow(0.82, attempt);
                const width = Math.max(1, Math.round(sourceWidth * scale));
                const height = Math.max(1, Math.round(sourceHeight * scale));
                const output = renderDataUrl(source, width, height, qualities[attempt], type === 'image/png');
                if (isDataUrlWithinLimit(output)) return output;
            }
            throw new Error('壓縮後仍超過上傳限制');
        } finally {
            source.close?.();
        }
    }

    return { MAX_CONCURRENCY, MAX_ORIGINAL_BYTES, MAX_DATA_URL_LENGTH, runBounded, isDataUrlWithinLimit, preprocessPhoto };
}));
