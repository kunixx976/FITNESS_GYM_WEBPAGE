-- ============================================
-- FIX: Allow anonymous users to submit leads
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- Drop the existing insert policy if it exists (it may be misconfigured)
DROP POLICY IF EXISTS "Allow public insert leads" ON leads;

-- Recreate: Allow the 'anon' role (used by SUPABASE_ANON_KEY) to insert leads
CREATE POLICY "Allow public insert leads" ON leads
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Also allow anon to select (to check for duplicate phone numbers)
DROP POLICY IF EXISTS "Allow anon select for duplicate check" ON leads;
CREATE POLICY "Allow anon select for duplicate check" ON leads
  FOR SELECT
  TO anon
  USING (true);
