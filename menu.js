// Dark Mode functionality

document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
});

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
