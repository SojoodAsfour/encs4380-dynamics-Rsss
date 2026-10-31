
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const themeLabel = document.getElementById("themeLabel");

function updateThemeButton() {
    const isDark = document.documentElement.classList.contains("dark");

    themeIcon.textContent = isDark ? "☀" : "☾";
    themeLabel.textContent = isDark ? "Light mode" : "Dark mode";

    themeToggle.setAttribute("aria-pressed", String(isDark));
}

themeToggle.addEventListener("click", () => {

    const isDark = document.documentElement.classList.toggle("dark");

    localStorage.setItem(
        "kinetiq-theme",
        isDark ? "dark" : "light"
    );
    updateThemeButton();
    window.dispatchEvent(new Event("kinetiq-theme-change"));
});

updateThemeButton();
