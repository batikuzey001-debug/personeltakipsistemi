// apps/admin/src/components/Alert.tsx
import React from "react";

type Variant = "error" | "info" | "success" | "warning";

const colors: Record<Variant, { bg: string; bd: string; fg: string }> = {
  error:   { bg: "#fff2f2", bd: "#f3c0c0", fg: "#b22323" },
  info:    { bg: "#f3f7ff", bd: "#c9d8ff", fg: "#1b3d9c" },
  success: { bg: "#f2fff6", bd: "#bfe7cc", fg: "#1b7d3a" },
  warning: { bg: "#fffaf2", bd: "#f3e0bf", fg: "#8a5a00" },
};

export default function Alert({
  variant = "info",
  title,
  children,
}: {
  variant?: Variant;
  title?: string;
  children?: React.ReactNode;
}) {
  const c = colors[variant];
  return (
    <div
      role="alert"
      style={{
        border: `1px solid ${c.bd}`,
        background: c.bg,
        color: c.fg,
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      {title && <div style={{ fontWeight: 800, marginBottom: 4 }}>{title}</div>}
      {children}
    </div>
  );
}
