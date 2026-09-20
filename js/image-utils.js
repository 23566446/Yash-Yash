(function () {
    const raster = /^data:image\/(jpeg|png|webp|gif|heic|heif|avif);base64,[A-Za-z0-9+/=\s]+$/i;
    window.safeImageSource = function (value, fallback = 'img/default-avatar.svg') {
        return typeof value === 'string' && raster.test(value) ? value : fallback;
    };
}());
