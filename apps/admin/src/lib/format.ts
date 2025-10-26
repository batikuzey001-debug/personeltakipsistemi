// apps/admin/src/lib/format.ts
export function formatSecondsToMmSs(sec?: number | null) {
  if (sec == null) return "";
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function formatPercent(p?: number | null) {
  if (p == null) return "";
  // 0..1 gelirse %'ye çevir; 0..100 gelirse olduğu gibi göster
  const val = p <= 1 ? p * 100 : p;
  return `${val.toFixed(1)}%`;
}

export function formatTL(n?: number | null) {
  if (n == null) return "";
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n} TL`;
  }
}
