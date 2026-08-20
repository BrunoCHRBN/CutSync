BEGIN;

-- Reconcile structural drift left by historical migrations that were recorded
-- remotely with different contents from the canonical local chain.
ALTER TABLE public.billing_accounts
  ADD COLUMN IF NOT EXISTS legal_entity_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.billing_accounts'::regclass
      AND conname = 'billing_accounts_legal_entity_id_fkey'
  ) THEN
    ALTER TABLE public.billing_accounts
      ADD CONSTRAINT billing_accounts_legal_entity_id_fkey
      FOREIGN KEY (legal_entity_id)
      REFERENCES public.legal_entities(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS billing_accounts_legal_entity_idx
  ON public.billing_accounts(legal_entity_id)
  WHERE legal_entity_id IS NOT NULL;

UPDATE public.establishments
SET share_agendas = true
WHERE share_agendas IS NULL;
ALTER TABLE public.establishments
  ALTER COLUMN share_agendas SET DEFAULT true,
  ALTER COLUMN share_agendas SET NOT NULL;

UPDATE public.profiles
SET commission_rate = 0.50
WHERE commission_rate IS NULL;
ALTER TABLE public.profiles
  ALTER COLUMN commission_rate SET DEFAULT 0.50,
  ALTER COLUMN commission_rate SET NOT NULL;

DO $$
DECLARE
  rename_record record;
BEGIN
  FOR rename_record IN
    SELECT *
    FROM (VALUES
      ('appointments', 'appointments_barber_id_fkey', 'appointments_professional_id_fkey'),
      ('appointments', 'appointments_barbershop_id_fkey', 'appointments_establishment_id_fkey'),
      ('professional_services', 'barber_services_barber_id_fkey', 'professional_services_professional_id_fkey'),
      ('professional_services', 'barber_services_barbershop_id_fkey', 'professional_services_establishment_id_fkey'),
      ('professional_services', 'barber_services_service_id_fkey', 'professional_services_service_id_fkey'),
      ('profile_establishments', 'profile_barbershops_barbershop_id_fkey', 'profile_establishments_establishment_id_fkey'),
      ('profile_establishments', 'profile_barbershops_profile_id_fkey', 'profile_establishments_profile_id_fkey'),
      ('profiles', 'profiles_barbershop_id_fkey', 'profiles_establishment_id_fkey'),
      ('services', 'services_barbershop_id_fkey', 'services_establishment_id_fkey')
    ) AS renames(table_name, old_name, new_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = format('public.%I', rename_record.table_name)::regclass
        AND conname = rename_record.old_name
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = format('public.%I', rename_record.table_name)::regclass
        AND conname = rename_record.new_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
        rename_record.table_name,
        rename_record.old_name,
        rename_record.new_name
      );
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
