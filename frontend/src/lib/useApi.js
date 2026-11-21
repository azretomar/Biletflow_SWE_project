import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

// True when the backend does not have this endpoint yet (or not for this method).
// A 404 that carries the backend's own JSON message (for example "event not found")
// comes from an endpoint that exists, so it is a real answer, not "not connected".
export function isNotConnected(err) {
  if (!err) return false;
  if (err.status === 405 || err.status === 501) return true;
  return err.status === 404 && !err.fromServer;
}

export const NOT_CONNECTED_TEXT = "This part is not connected to the server yet.";

// Loads `path` from the backend once (and again on reload()).
// status: "loading" | "ready" | "not_connected" | "error"
// code: the HTTP status of the last failed request (404 = not found), 0 otherwise
// While an endpoint does not exist yet, pages show their empty state plus a
// short note, and start working by themselves once the backend adds it.
export function useApi(path, fallback = null) {
  const [data, setData] = useState(fallback);
  const [status, setStatus] = useState(path ? "loading" : "ready");
  const [error, setError] = useState("");
  const [code, setCode] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return undefined;
    let active = true;
    setStatus("loading");
    setCode(0);
    api(path)
      .then((d) => {
        if (!active) return;
        setData(d ?? fallback);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        setData(fallback);
        setError(err.message);
        setCode(err.status || 0);
        setStatus(isNotConnected(err) ? "not_connected" : "error");
      });
    return () => {
      active = false;
    };
    // fallback is a constant default; reloading only on path or reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, setData, status, error, code, reload };
}

// Runs a change (POST/PUT) and returns { ok, data, message } instead of throwing,
// with a friendly message when the endpoint is not built yet.
export async function send(path, method, body) {
  try {
    const data = await api(path, { method, body });
    return { ok: true, data, message: "" };
  } catch (err) {
    return { ok: false, data: null, message: isNotConnected(err) ? NOT_CONNECTED_TEXT : err.message };
  }
}

// Small status line shown under a section while data is loading or missing.
export function statusNote(status, error) {
  if (status === "loading") return "Loading...";
  if (status === "not_connected") return NOT_CONNECTED_TEXT;
  if (status === "error") return error;
  return "";
}
