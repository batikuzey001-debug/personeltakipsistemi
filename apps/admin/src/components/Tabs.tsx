// apps/admin/src/components/Tabs.tsx
import React, { ReactNode, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

type Tab = { key: string; label: string; content: ReactNode };

export default function Tabs({
  tabs,
  initialKey,
  queryKey = "tab",
}: {
  tabs: Tab[];
  initialKey?: string;
  queryKey?: string; // URL'de kullanılacak anahtar (varsayılan 'tab')
}) {
  const [params, setParams] = useSearchParams();
  const tabFromUrl = params.get(queryKey || "tab") || "";
  const firstKey = useMemo(() => tabs[0]?.key || "", [tabs]);
  const [active, setActive] = useState<string>(tabFromUrl || initialKey || firstKey);

  useEffect(() => {
    // URL dışarıdan değişirse aktif tab'ı güncelle
    if (tabFromUrl && tabFromUrl !== active) setActive(tabFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  const onChange = (key: string) => {
    setActive(key);
    const next = new URLSearchParams(params);
    if (key) next.set(queryKey, key);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #eee", marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              padding: "8px 12px",
              border: "1px solid #ddd",
              borderBottom: active === t.key ? "2px solid #111" : "1px solid #ddd",
              background: active === t.key ? "#f9f9f9" : "#fff",
              fontWeight: active === t.key ? 700 : 500,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{tabs.find((t) => t.key === active)?.content}</div>
    </div>
  );
}
