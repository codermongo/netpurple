// Burger Menu and Dark Mode functionality

document.addEventListener('DOMContentLoaded', () => {
    initBurgerMenu();
    initDarkMode();
});

/* ===== BURGER MENU ===== */
function initBurgerMenu() {
    const burgerIcon = document.getElementById('burgerIcon');
    const burgerMenuContainer = document.getElementById('burgerMenuContainer');

    if (!burgerIcon || !burgerMenuContainer) return;

    function toggleMenu() {
        burgerMenuContainer.classList.toggle('expanded');
    }

    function closeMenu() {
        burgerMenuContainer.classList.remove('expanded');
    }

    // Toggle menu on burger icon click
    burgerIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!burgerMenuContainer.contains(e.target)) {
            closeMenu();
        }
    });

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && burgerMenuContainer.classList.contains('expanded')) {
            closeMenu();
        }
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
