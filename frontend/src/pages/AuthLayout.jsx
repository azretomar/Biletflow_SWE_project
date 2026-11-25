import { Link } from "react-router-dom";
import { t } from "../i18n";
import LanguagePicker from "../components/LanguagePicker";
import "./auth.css";

function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Link to="/" className="auth-logo">BiletFlow</Link>
        <div className="auth-side-text">
          <h2>{t("Events across Kazakhstan, one ticket away.")}</h2>
          <ul>
            <li>{t("Free events stay free")}</li>
            <li>{t("QR-code tickets you can print")}</li>
            <li>{t("Fast check-in at the door")}</li>
          </ul>
        </div>
        <span className="auth-side-foot">© 2026 BiletFlow</span>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <LanguagePicker />
          <Link to="/" className="auth-back">← {t("Back to home")}</Link>
          <h1>{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}

export default AuthLayout;
