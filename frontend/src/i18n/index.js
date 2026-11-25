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
  }
  const browser = (typeof navigator !== "undefined" && navigator.language ? navigator.language : "").slice(0, 2);
  return isLanguage(browser) ? browser : "en";
}

let current = startLanguage();

export function getLanguage() {
  return current;
}

export function storeLanguage(code) {
  if (!isLanguage(code)) return;
  current = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
  }
}

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

export function roleName(role) {
  return ROLE_NAMES[role] ? t(ROLE_NAMES[role]) : role;
}

export const LanguageContext = createContext({ language: current, setLanguage: () => {} });

export function useLanguage() {
  return useContext(LanguageContext);
}
