const DEFAULT_LANGUAGE = "en";
const SUPPORTED_LANGUAGES = ["en", "ru", "uz"];
const STORAGE_KEY = "baraka-presentation-language";

function getNestedValue(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object);
}

function loadTranslations(language) {
  const locales = window.BARAKA_PRESENTATION_LOCALES || {};
  return locales[language];
}

function applyTranslations(translations) {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    const value = getNestedValue(translations, key);

    if (typeof value === "string") {
      node.textContent = value;
    }
  });
}

function setActiveButton(language) {
  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === language);
  });
}

async function setLanguage(language) {
  const selectedLanguage = SUPPORTED_LANGUAGES.includes(language)
    ? language
    : DEFAULT_LANGUAGE;

  try {
    const translations = await loadTranslations(selectedLanguage);
    if (!translations) {
      throw new Error(`Locale not found: ${selectedLanguage}`);
    }
    applyTranslations(translations);
    setActiveButton(selectedLanguage);
    document.documentElement.lang = selectedLanguage;
    localStorage.setItem(STORAGE_KEY, selectedLanguage);
  } catch (error) {
    if (selectedLanguage !== DEFAULT_LANGUAGE) {
      await setLanguage(DEFAULT_LANGUAGE);
      return;
    }

    console.error("Unable to load presentation translations", error);
  }
}

function setupLanguageSwitcher() {
  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.addEventListener("click", () => {
      setLanguage(button.dataset.lang);
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupLanguageSwitcher();
  const savedLanguage = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE;
  await setLanguage(savedLanguage);
});
