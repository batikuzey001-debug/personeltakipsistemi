# RBAC Matrisi (V1)

Roller:
- super_admin
- admin
- manager
- employee

Kapsam Kuralları:
- super_admin → sınırsız
- admin → tüm takımlar, sistem ayarı hariç
- manager → sadece kendi team_scope (ve alt takımları)
- employee → sadece kendi kaydı/kartı (read)

Kaynaklar & Aksiyonlar
| Kaynak / Aksiyon               | super_admin | admin | manager           | employee    |
|--------------------------------|:-----------:|:-----:|:-----------------:|:-----------:|
| Users (create/update/disable)  |     ✅      |  ✅   |        ❌         |     ❌      |
| Roles atama (user→role)        |     ✅      |  ✅   |        ❌         |     ❌      |
| Teams CRUD                     |     ✅      |  ✅   |  read             |     ❌      |
| KPI Kataloğu CRUD              |     ✅      |  ✅   |  read             |     ❌      |
| Team KPI Config (hedef/weight) |     ✅      |  ✅   |  own teams: update|     ❌      |
| Employee CRUD                  |     ✅      |  ✅   |  own teams: create/update | self: profile(update-limited) |
| Employee KPI Override          |     ✅      |  ✅   |  own teams: update|     ❌      |
| Events ingest (webhook)        |     ✅      |  ✅   |        ❌         |     ❌      |
| Facts/Jobs run (derive)        |     ✅      |  ✅   |        ❌         |     ❌      |
| Manual Report Templates CRUD   |     ✅      |  ✅   |  read             |     ❌      |
| Manual Reports (submit/approve)|  approve    |approve| submit (own team) |   submit(self, if enabled) |
| Performance Card (read)        |     ✅      |  ✅   | own teams: read   | self: read  |
| Dashboard (read)               |     ✅      |  ✅   | own teams: read   |   limited   |
| Imports (CSV)                  |     ✅      |  ✅   |        ❌         |     ❌      |
| Settings (Telegram, secrets)   |     ✅      |  ❌   |        ❌         |     ❌      |
| Audit Logs (read)              |     ✅      |  ✅   |        ❌         |     ❌      |

Notlar:
- **manager** yalnızca **kendi takımındaki** employee kayıtlarını oluşturabilir/düzenleyebilir.
- **employee** profil güncellemesi sınırlıdır (iletişim, avatar vb.); takım/ünvan/rol değişikliği yapamaz.
- Manual Reports: manager → submit; admin/super_admin → approve.
- Tüm mutasyonlar **audit_logs**’a yazılır (actor, entity, diff).
