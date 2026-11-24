import { LANGUAGES, t, useLanguage } from "../i18n";
import "./languagePicker.css";

// Language switch shown in the navbar, the admin portal and the login pages.
export default function LanguagePicker({ className = "" }) {
  const { language, setLanguage } = useLanguage();
  return (
    <label className={"lang-picker " + className}>
      <span className="lang-picker-label">{t("Language")}</span>
      <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label={t("Language")}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
