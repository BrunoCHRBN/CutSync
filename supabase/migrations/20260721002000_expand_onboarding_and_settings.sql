-- Migration: Expand onboarding and settings options for Client, Professional, and Admin roles
BEGIN;

-- Add new settings columns to establishments
ALTER TABLE public.establishments 
  ADD COLUMN IF NOT EXISTS min_cancellation_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS no_show_fee_percent numeric DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- Add notification preferences and pix_key columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS notification_channels text[] DEFAULT ARRAY['push', 'whatsapp'],
  ADD COLUMN IF NOT EXISTS pix_key text;

-- Create work_shifts table for granular professional shift schedule
CREATE TABLE IF NOT EXISTS public.work_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, day_of_week)
);

-- Enable RLS for work_shifts
ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;

-- Create policies for work_shifts
CREATE POLICY "Allow authenticated read work_shifts" 
  ON public.work_shifts FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow profiles to manage own work_shifts" 
  ON public.work_shifts FOR ALL 
  TO authenticated 
  USING (profile_id = auth.uid()) 
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Allow superadmin all work_shifts" 
  ON public.work_shifts FOR ALL 
  TO authenticated 
  USING (public.is_superadmin());

COMMIT;
