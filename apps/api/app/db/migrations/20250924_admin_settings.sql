-- apps/api/app/db/migrations/20250924_admin_settings.sql
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Varsayılan: bildirimler KAPALI (0). Açmak için paneli kullanacaksın.
INSERT INTO admin_settings (key, value)
VALUES ('admin_tasks_tg_enabled', '0')
ON CONFLICT (key) DO NOTHING;
