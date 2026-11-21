import { useMemo } from "react";
import { qrMatrix } from "../lib/qrcode";

// Draws a QR code as SVG: sharp on screen and on paper, also in grayscale.
// `value` is the ticket's qr_code from the backend. A 4-square white border
// ("quiet zone") is kept around the code so scanners can find it.
function QrCode({ value, size = 220, label = "Ticket QR code" }) {
  const path = useMemo(() => {
    if (!value) return "";
    const rows = qrMatrix(value, "M");
    let d = "";
    rows.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z`;
      })
    );
    return { d, n: rows.length + 8 };
  }, [value]);

  if (!value) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${path.n} ${path.n}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      style={{ display: "block", background: "#ffffff" }}
    >
      <rect width={path.n} height={path.n} fill="#ffffff" />
      <path d={path.d} fill="#000000" />
    </svg>
  );
}

export default QrCode;
