(function () {
  var STORAGE_KEY = "theme";
  var media = window.matchMedia("(prefers-color-scheme: light)");
  var labels = {
    en: {
      light: "Switch to light mode",
      dark: "Switch to dark mode",
    },
    pt: {
      light: "Mudar para o modo claro",
      dark: "Mudar para o modo escuro",
    },
  };

  function systemTheme() {
    return media.matches ? "light" : "dark";
  }

  function storedTheme() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function siteLang() {
    var lang = document.documentElement.lang || "";
    return lang.indexOf("pt") === 0 ? "pt" : "en";
  }

  function syncControl(theme) {
    var button = document.querySelector(".theme-toggle");
    if (!button) return;
    var next = theme === "light" ? "dark" : "light";
    button.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    button.setAttribute("aria-label", labels[siteLang()][next]);
  }

  function applyTheme(theme) {
    var previous = currentTheme();
    document.documentElement.setAttribute("data-theme", theme);
    syncControl(theme);
    if (previous !== theme) {
      document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: theme } }));
    }
  }

  function persist(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {}
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest ? event.target.closest(".theme-toggle") : null;
    if (!button) return;
    var next = currentTheme() === "light" ? "dark" : "light";
    persist(next);
    applyTheme(next);
  });

  function onSystemChange() {
    if (storedTheme()) return;
    applyTheme(systemTheme());
  }

  if (media.addEventListener) media.addEventListener("change", onSystemChange);
  else if (media.addListener) media.addListener(onSystemChange);

  syncControl(currentTheme());

  document.addEventListener("DOMContentLoaded", function () {
    var previous = window.applySiteLanguage;
    window.applySiteLanguage = function () {
      if (typeof previous === "function") previous();
      syncControl(currentTheme());
    };
    syncControl(currentTheme());
  });
})();
