(function loadGoogleMaps() {
    const key = window.YashYashConfig?.GOOGLE_MAPS_API_KEY;
    if (!key) {
        console.error('Google Maps API key is not configured.');
        return;
    }

    document.write(`<script src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places"><\/script>`);
}());
