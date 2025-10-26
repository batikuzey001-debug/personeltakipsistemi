import React from "react";
import Tabs from "../components/Tabs";

// Mevcut sayfaları projenden içeri alıyoruz (dosya isimlerin farklıysa bu importları kendi isimlerine göre değiştir)
import Employees from "./Employees";
import EmployeeProfile from "./EmployeeProfile";
import Identities from "./Identities";
import Shifts from "./Shifts";

export default function Personel() {
  const tabs = [
    { key: "list", label: "Liste", content: <Employees /> },
    // Not: Profil sayfası normalde seçili çalışan ister; burada özet/placeholder şeklinde durur.
    { key: "profile", label: "Profil", content: <EmployeeProfile /> },
    { key: "ids", label: "Kimlikler", content: <Identities /> },
    { key: "shifts", label: "Vardiya", content: <Shifts /> },
  ];

  return (
    <section style={{ padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Personel</h1>
      <Tabs tabs={tabs} initialKey="list" />
    </section>
  );
}
