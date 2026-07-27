BEGIN;
-- Schema-only staging restores intentionally contain no catalog rows.
-- Recreate the public billing catalog from versioned product decisions.

INSERT INTO public.organization_billing_plans(
  code,
  name,
  base_price_cents,
  currency,
  is_network,
  entitlements
)
VALUES
  (
    'multi_unit_standard',
    'Multiunidade',
    4990,
    'BRL',
    false,
    '["business_web","business_app","appointments","team","services","reports"]'::jsonb
  ),
  (
    'network',
    'Rede',
    NULL,
    'BRL',
    true,
    '["business_web","business_app","appointments","team","services","reports"]'::jsonb
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  base_price_cents = EXCLUDED.base_price_cents,
  currency = EXCLUDED.currency,
  is_network = EXCLUDED.is_network,
  entitlements = EXCLUDED.entitlements,
  updated_at = now();
INSERT INTO public.plan_unit_tiers(
  plan_id,
  unit_from,
  unit_to,
  percentage_basis_points,
  unit_price_cents
)
SELECT
  plan.id,
  tier.unit_from,
  tier.unit_to,
  tier.percentage_basis_points,
  tier.unit_price_cents
FROM public.organization_billing_plans AS plan
CROSS JOIN (
  VALUES
    (1, 1, 10000, 4990),
    (2, 2, 9000, 4490),
    (3, 4, 8000, 3990)
) AS tier(unit_from, unit_to, percentage_basis_points, unit_price_cents)
WHERE plan.code = 'multi_unit_standard'
ON CONFLICT (plan_id, unit_from) DO UPDATE
SET
  unit_to = EXCLUDED.unit_to,
  percentage_basis_points = EXCLUDED.percentage_basis_points,
  unit_price_cents = EXCLUDED.unit_price_cents;
COMMIT;
