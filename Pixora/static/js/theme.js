(function () {
    "use strict";

    const preferenceKey = "pixora-theme";
    const root = document.documentElement;
    root.classList.add("js-enabled");

    function readPreference() {
        try {
            const preference = window.localStorage.getItem(preferenceKey);
            return preference === "light" || preference === "dark" ? preference : null;
        } catch {
            return null;
        }
    }

    function getSystemTheme() {
        try {
            return typeof window.matchMedia === "function" &&
                window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
        } catch {
            return "light";
        }
    }

    function applyTheme(theme) {
        root.dataset.theme = theme;

        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) {
            themeColor.content = theme === "dark" ? "#111827" : "#FFFFFF";
        }

        const toggle = document.querySelector("[data-theme-toggle]");
        if (!toggle) return;

        const nextTheme = theme === "dark" ? "light" : "dark";
        toggle.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
        toggle.setAttribute("title", `Switch to ${nextTheme} mode`);
        toggle.setAttribute("aria-pressed", String(theme === "dark"));
    }

    let savedPreference = readPreference();
    applyTheme(savedPreference || getSystemTheme());

    function initializeToggle() {
        const toggle = document.querySelector("[data-theme-toggle]");
        if (!toggle) return;

        applyTheme(root.dataset.theme || "light");
        toggle.addEventListener("click", () => {
            const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
            savedPreference = nextTheme;
            try {
                window.localStorage.setItem(preferenceKey, nextTheme);
            } catch {
                // The current page still honors the choice when storage is unavailable.
            }
            applyTheme(nextTheme);
        });
    }

    function initializeMenu() {
        const toggle = document.querySelector("[data-menu-toggle]");
        const header = document.querySelector(".topbar");
        const navigation = document.getElementById("pixora-main-nav");
        if (!toggle || !header || !navigation) return;

        function setMenuOpen(isOpen) {
            header.classList.toggle("menu-open", isOpen);
            toggle.setAttribute("aria-expanded", String(isOpen));
            const label = isOpen ? "Close navigation menu" : "Open navigation menu";
            toggle.setAttribute("aria-label", label);
            toggle.setAttribute("title", label);
        }

        toggle.addEventListener("click", () => {
            setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
        });
        navigation.addEventListener("click", event => {
            if (event.target.closest("a")) setMenuOpen(false);
        });
        document.addEventListener("click", event => {
            if (!header.contains(event.target)) setMenuOpen(false);
        });
        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                setMenuOpen(false);
                toggle.focus();
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            initializeToggle();
            initializeMenu();
        }, { once: true });
    } else {
        initializeToggle();
        initializeMenu();
    }

    try {
        if (typeof window.matchMedia === "function") {
            const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
            const handleSystemThemeChange = event => {
                if (!savedPreference) applyTheme(event.matches ? "dark" : "light");
            };

            if (typeof systemTheme.addEventListener === "function") {
                systemTheme.addEventListener("change", handleSystemThemeChange);
            } else if (typeof systemTheme.addListener === "function") {
                systemTheme.addListener(handleSystemThemeChange);
            }
        }
    } catch {
        // Theme initialization already succeeded; system change events are optional.
    }

})();