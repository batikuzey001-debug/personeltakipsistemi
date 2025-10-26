// apps/admin/src/pages/Diag.tsx
import React, { useEffect, useState } from "react";
import { API_BASE, API_PREFIX, api } from "../lib/api";

export default function Diag() {
  const [token] = useState(!!localStorage.getItem("token"));
  const [health, setHealth] = useState<string>("(yükleniyor)");
  const [routes, setRoutes] = useState<string[] | string>("(yükleniyor)");
  const baseShown = API_BASE || window.location.origin;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // /healthz ve /health'ten hangisi varsa onu bul
        let ok: any = null;
        try { ok = await api.get<any>("/healthz"); } catch {}
        if (!ok) { try { ok = await api.get<any>("/health"); } catch {}
        }
        if (mounted) setHealth(ok ? JSON.stringify(ok) : "ulaşılamıyor");
      } catch (e: any) {
        if (mounted) setHealth(e?.message || "hata");
      }
      try {
        const r = await api.get<string[] | any>("/_routes");
        if (mounted) setRoutes(Array.isArray(r) ? r : JSON.stringify(r));
      } catch (e: any) {
        if (mounted) setRoutes(e?.message || "hata");
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Diagnostik</h1>
      <div style={{ marginBottom: 12 }}>
        <div><b>API_BASE:</b> {baseShown}</div>
        <div><b>API_PREFIX:</b> {API_PREFIX || "(boş)"}</div>
        <div><b>Token var mı?</b> {token ? "Evet" : "Hayır"}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: "12px 0 6px" }}>/health</h3>
        <pre style={pre}>{health}</pre>
      </div>
      <div>
        <h3 style={{ margin: "12px 0 6px" }}>/\_routes</h3>
        <pre style={pre}>{Array.isArray(routes) ? routes.join("\n") : routes}</pre>
      </div>
    </div>
  );
}
const pre: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 10,
  background: "#fafafa",
  padding: 12,
  whiteSpace: "pre-wrap",
};
