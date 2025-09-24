-- apps/api/app/db/migrations/20250924_admin_tasks.sql
CREATE TABLE IF NOT EXISTS admin_tasks (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  shift VARCHAR(20),
  title VARCHAR(200) NOT NULL,
  department VARCHAR(50),
  assignee_employee_id VARCHAR(50),
  due_ts TIMESTAMP,
  grace_min INT NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  done_at TIMESTAMP,
  done_by VARCHAR(50),
  last_alert_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_task_templates (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  department VARCHAR(50),
  shift VARCHAR(20),
  repeat VARCHAR(20) NOT NULL DEFAULT 'daily',
  grace_min INT NOT NULL DEFAULT 0,
  default_assignee VARCHAR(50),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_tasks_date ON admin_tasks(date);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_status ON admin_tasks(status);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_assignee ON admin_tasks(assignee_employee_id);
