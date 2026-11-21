import { useState } from "react";
import "./eventImage.css";

// Shows the event's cover image (image_url), or the grey placeholder when there is none
// or the link is broken. Decorative: the event title is always written next to it.
function EventImage({ src, className = "", label = "Event image" }) {
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
  return <div className={`bf-img bf-img-ph ${className}`}>{label}</div>;
}

export default EventImage;
