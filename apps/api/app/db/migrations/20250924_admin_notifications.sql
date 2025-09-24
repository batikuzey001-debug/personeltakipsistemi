-- apps/api/app/db/migrations/20250924_admin_notifications.sql
CREATE TABLE IF NOT EXISTS admin_notifications (
  id SERIAL PRIMARY KEY,
  channel VARCHAR(32) NOT NULL,    -- 'bonus' | 'finans' | 'admin_tasks' | 'attendance' | 'custom'
  name VARCHAR(120) NOT NULL,      -- kısa ad
  template TEXT NOT NULL,          -- metin şablonu (ör: "📣 {title}\n{body}")
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_chan ON admin_notifications(channel);
