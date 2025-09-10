function Stat({ title, value, caption }: { title: string; value: string | number; caption?: string }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, margin: "4px 0" }}>{value}</div>
      {caption && <div style={{ fontSize: 12, opacity: 0.6 }}>{caption}</div>}
    </div>
  );
}

export default function Dashboard() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <Stat title="Aktif Personel" value={0} caption="placeholder" />
        <Stat title="Ortalama Skor" value={"-"} caption="placeholder" />
        <Stat title="Risk Altı" value={0} caption="overall < 70" />
        <Stat title="Bekleyen İşler" value={0} caption="ETL / import" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, minHeight: 180 }}>
          <b>Son Eklenen Personel</b>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>placeholder</div>
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, minHeight: 180 }}>
          <b>Son ETL Koşuları</b>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>placeholder</div>
        </div>
      </div>
    </div>
  );
}
