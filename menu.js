// Dark Mode functionality

document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    initLowPowerMode();
});

/* ===== LOW POWER MODE ===== */
function initLowPowerMode() {
    const LP_KEY = 'lowPowerMode';

    if (localStorage.getItem(LP_KEY) === 'true') {
        document.body.classList.add('low-power-mode');
    }

    const container = document.querySelector('.theme-toggle-container');
    if (!container) return;

    const btn = document.createElement('button');
    btn.className = 'menu-item-circle visible';
    btn.id = 'lowPowerToggle';
    btn.setAttribute('aria-label', 'Toggle low performance mode');
    btn.setAttribute('aria-pressed', String(localStorage.getItem(LP_KEY) === 'true'));
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"/></svg>';
    container.appendChild(btn);

    btn.addEventListener('click', () => {
        const isLow = document.body.classList.toggle('low-power-mode');
        localStorage.setItem(LP_KEY, String(isLow));
        btn.setAttribute('aria-pressed', String(isLow));
    });
}

/* ===== DARK MODE ===== */
function initDarkMode() {
    // Check for saved dark mode preference
    const savedMode = localStorage.getItem('darkMode');
    const isDarkMode = savedMode === 'true';

    // Apply saved preference
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
    }

    // Get the theme toggle button
    const themeToggleItem = document.getElementById('themeToggleItem');

    if (!themeToggleItem) return;

    themeToggleItem.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isNowDark = document.body.classList.contains('dark-mode');

        // Save preference
        localStorage.setItem('darkMode', isNowDark);

        // Optional: Show notification (if toast exists)
        if (typeof toast !== 'undefined') {
            toast.show(`${isNowDark ? 'Light' : 'Dark'} Mode aktiviert`, 'success');
        }
    });
}
