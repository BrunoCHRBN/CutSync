BEGIN;

-- PS1-E1B.2.2 — Cashier Segregation of Duties & Capability Parity
-- Removes manage_team_orders from the cashier role template to prevent
-- cash operators from modifying service order items, lifecycle status,
-- or operational details. Cashier preserves view_orders, view_team_orders,
-- take_payments, void_payments, view_cash, operate_cash, and close_cash.

DELETE FROM public.business_role_template_capabilities
WHERE role_template = 'cashier'
  AND capability = 'manage_team_orders';

COMMIT;
