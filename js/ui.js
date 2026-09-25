window.showToast = function (message, type = 'info', duration = 3500) {
    let region = document.getElementById('ui-toast-region');
    if (!region) { region = document.createElement('div'); region.id = 'ui-toast-region'; region.setAttribute('aria-live', 'polite'); region.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;max-width:90%'; document.body.appendChild(region); }
    const toast = document.createElement('div'); toast.textContent = message; toast.style.cssText = `padding:10px 14px;margin:6px;border-radius:8px;color:#fff;background:${type === 'error' ? '#a94442' : '#6b8051'};`; region.appendChild(toast); setTimeout(() => toast.remove(), duration);
};
window.setButtonBusy = function (button, busy, label) { if (!button) return; if (busy) { button.dataset.label = button.textContent; button.disabled = true; if (label) button.textContent = label; } else { button.disabled = false; if (button.dataset.label) button.textContent = button.dataset.label; } };
