// Click-to-open behavior for the collapsed nav menu (also still opens on
// hover via CSS, so this only matters for touch/click devices).
document.querySelectorAll('.nav-menu').forEach((menu) => {
    const toggle = menu.querySelector('.nav-menu-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = menu.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
});

document.addEventListener('click', (event) => {
    document.querySelectorAll('.nav-menu.is-open').forEach((menu) => {
        if (!menu.contains(event.target)) {
            menu.classList.remove('is-open');
            menu.querySelector('.nav-menu-toggle')?.setAttribute('aria-expanded', 'false');
        }
    });
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.nav-menu.is-open').forEach((menu) => {
        menu.classList.remove('is-open');
        menu.querySelector('.nav-menu-toggle')?.setAttribute('aria-expanded', 'false');
    });
});
