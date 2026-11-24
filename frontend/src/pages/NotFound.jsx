import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { t } from "../i18n";

// Shown for any address that is not a page on BiletFlow.
function NotFound() {
  return (
    <div>
      <Navbar />
      <main className="bf-page" style={{ textAlign: "center", paddingTop: 64 }}>
        <p className="bf-muted" style={{ fontSize: 48, fontWeight: "bold", margin: 0 }}>404</p>
        <h1 className="bf-title">{t("Page not found")}</h1>
        <p className="bf-muted">{t("The page you are looking for does not exist or was moved.")}</p>
        <p style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/" className="bf-btn">{t("Go to home")}</Link>
          <Link to="/events" className="bf-btn-outline">{t("Browse events")}</Link>
        </p>
      </main>
    </div>
  );
}

export default NotFound;
