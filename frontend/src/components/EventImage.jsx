import { useState } from "react";
import "./eventImage.css";
import { t } from "../i18n";

function EventImage({ src, className = "", label }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className={`bf-img-photo ${className}`}
        onError={() => setBroken(true)}
      />
    );
  }
  return <div className={`bf-img bf-img-ph ${className}`}>{label || t("Event image")}</div>;
}

export default EventImage;
