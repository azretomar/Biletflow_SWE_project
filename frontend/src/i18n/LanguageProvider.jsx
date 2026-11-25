import { Fragment, useEffect, useState } from "react";
import { LanguageContext, getLanguage, storeLanguage } from "./index";

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
