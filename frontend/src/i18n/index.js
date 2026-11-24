// Interface languages (SRS 7): Kazakh and Russian, with English as an additional locale.
//
// The English text itself is the key: write t("Log out") in a page, and add
// "Log out" with its translation to kk.js and ru.js. A text that is missing from
// a dictionary is shown in English, so nothing breaks while a translation is missing.
//
// Values in {curly braces} are filled in: t("{n} left", { n: 5 }).
// A dictionary value can also be a function of those values (used for plurals).
//
// Changing the language re-draws the whole app (see LanguageProvider), so t()
// may be called anywhere during rendering, including in small helper functions.
import { createContext, useContext } from "react";
export { ruPlural } from "./plural";
import en from "./en";
import kk from "./kk";
import ru from "./ru";

export const LANGUAGES = [
  { code: "kk", label: "Қазақша" },
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
];

const DICTIONARIES = { en, kk, ru };
const LOCALES = { kk: "kk-KZ", ru: "ru-RU", en: "en-GB" };
const STORAGE_KEY = "bf_lang";

function isLanguage(code) {
  return LANGUAGES.some((l) => l.code === code);
}

function startLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // storage blocked: fall through to the browser language
  }
  const browser = (typeof navigator !== "undefined" && navigator.language ? navigator.language : "").slice(0, 2);
  return isLanguage(browser) ? browser : "en";
}

let current = startLanguage();

export function getLanguage() {
  return current;
}

// Saves the choice. LanguageProvider calls this and then re-draws the app.
export function storeLanguage(code) {
  if (!isLanguage(code)) return;
  current = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // the choice then lasts until the page is reloaded
  }
}

// Locale for dates and numbers, e.g. "ru-RU".
export function locale() {
  return LOCALES[current];
}

export function t(text, params) {
  const dict = DICTIONARIES[current];
  let out = dict && Object.prototype.hasOwnProperty.call(dict, text) ? dict[text] : text;
  if (typeof out === "function") out = out(params || {});
  if (params) {
    out = out.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
  }
  return out;
}

const ROLE_NAMES = {
  attendee: "Attendee",
  organizer: "Organizer",
  event_admin: "Event admin",
  platform_admin: "Platform admin",
};

// "organizer" -> "Organizer" / "Организатор" / "Ұйымдастырушы"
export function roleName(role) {
  return ROLE_NAMES[role] ? t(ROLE_NAMES[role]) : role;
}

export const LanguageContext = createContext({ language: current, setLanguage: () => {} });

export function useLanguage() {
  return useContext(LanguageContext);
}
