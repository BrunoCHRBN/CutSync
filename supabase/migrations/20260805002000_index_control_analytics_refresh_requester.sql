BEGIN;

-- The CLI scaffold follows the workstation clock. This repository already has
-- forward-versioned migrations, so the file is placed after 20260805001000.
CREATE INDEX IF NOT EXISTS control_metric_refresh_runs_requested_by_idx
  ON analytics_private.control_metric_refresh_runs (requested_by)
  WHERE requested_by IS NOT NULL;

COMMIT;
