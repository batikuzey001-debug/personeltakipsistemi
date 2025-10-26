// apps/admin/src/lib/labels.ts
export const deptLabels: Record<string, string> = {
  livechat: "LiveChat",
  bonus: "Bonus",
  finance: "Finans",
  admin: "Admin",
  other: "Diğer",
};

export const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  viewer: "Görüntüleyici",
  employee: "Personel",
};

export const statusLabels: Record<string, string> = {
  active: "Aktif",
  passive: "Pasif",
};

export function labelOf(map: Record<string, string>, value?: string) {
  if (!value) return "";
  return map[value] ?? value;
}
