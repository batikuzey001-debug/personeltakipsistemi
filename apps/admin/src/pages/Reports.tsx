import React from "react";
import Tabs from "../components/Tabs";

// Mevcut sayfaları projenden içeri alıyoruz (dosya isimlerin farklıysa bu importları kendi isimlerine göre değiştir)
import ReportsDaily from "./ReportsDaily";
import ReportBonusClose from "./ReportBonusClose";
import ReportsFinance from "./ReportsFinance";
import LivechatAgentReport from "./LivechatAgentReport";
import ReportsThreadFeed from "./ReportsThreadFeed";

export default function Reports() {
  const tabs = [
    { key: "daily", label: "Günlük", content: <ReportsDaily /> },
    { key: "bonus", label: "Bonus", content: <ReportBonusClose /> },
    { key: "finance", label: "Finans", content: <ReportsFinance /> },
    { key: "livechat", label: "LiveChat", content: <LivechatAgentReport /> },
    { key: "thread", label: "Thread Feed", content: <ReportsThreadFeed /> },
  ];

  return (
    <section style={{ padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Raporlar</h1>
      <Tabs tabs={tabs} initialKey="daily" />
    </section>
  );
}
