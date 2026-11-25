import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";

export function isNotConnected(err) {
  if (!err) return false;
  if (err.status === 405 || err.status === 501) return true;
  return err.status === 404 && !err.fromServer;
}

export const NOT_CONNECTED_TEXT = "This part is not connected to the server yet.";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, setData, status, error, code, reload };
}

export async function send(path, method, body) {
  try {
    const data = await api(path, { method, body });
    return { ok: true, data, message: "" };
  } catch (err) {
    return { ok: false, data: null, message: isNotConnected(err) ? t(NOT_CONNECTED_TEXT) : err.message };
  }
}

export function statusNote(status, error) {
  if (status === "loading") return t("Loading...");
  if (status === "not_connected") return t(NOT_CONNECTED_TEXT);
  if (status === "error") return error;
  return "";
}
