import { Fragment, useEffect, useState } from "react";
import { LanguageContext, getLanguage, storeLanguage } from "./index";

// Keeps the chosen language and re-draws the whole app when it changes.
// The key makes React build every page again, so all t() calls run again in the new
// language. Text typed into a form on the current page is lost when the language changes.
export default function LanguageProvider({ children }) {
  const [language, setState] = useState(getLanguage());

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function setLanguage(code) {
    storeLanguage(code);
    setState(getLanguage());
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <Fragment key={language}>{children}</Fragment>
    </LanguageContext.Provider>
  );
}
