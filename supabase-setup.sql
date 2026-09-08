-- ============================================================================
-- supabase-setup.sql
-- Run this entire file in your Supabase project's SQL Editor.
-- Dashboard → SQL Editor → New Query → paste → Run
-- ============================================================================


-- ============================================================================
-- 1. SUBMISSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.submissions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL    DEFAULT now(),

  -- Consent record
  consent_version     text        NOT NULL,
  consent_timestamp   timestamptz NOT NULL,

  -- Location (nullable — in case location was unavailable)
  latitude            float8,
  longitude           float8,
  location_accuracy   float8,
  location_timestamp  bigint,           -- epoch milliseconds from Geolocation API

  -- Recording reference (path inside the "recordings" storage bucket)
  recording_path      text,
  recording_mime_type text,
  recording_duration  smallint,         -- seconds

  -- Lifecycle
  status              text        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'complete', 'error'))
);

-- Optional: add a comment so you remember what this table is for
COMMENT ON TABLE public.submissions IS
  'One row per tester submission. Recording file is in Supabase Storage.';


-- ============================================================================
-- 2. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on the table
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- ── 2a. Allow anonymous users to INSERT a new row ──────────────────────────
--   The anon role is what the browser uses when calling Supabase with the
--   public anon key. We allow INSERT so the page can save a submission.
--   We do NOT allow SELECT, UPDATE, or DELETE for the anon role.
CREATE POLICY "anon_can_insert"
  ON public.submissions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ── 2b. Authenticated users (you, via Supabase dashboard) can read all rows ─
--   This lets you view submissions in the Table Editor / SQL Editor.
--   If you want to restrict dashboard access further, adjust this policy.
CREATE POLICY "authenticated_can_select"
  ON public.submissions
  FOR SELECT
  TO authenticated
  USING (true);

-- ── 2c. No public SELECT — anon users cannot read each other's data ─────────
--   (There is intentionally NO SELECT policy for the anon role.)


-- ============================================================================
-- 3. STORAGE — must be done via the Supabase Dashboard UI
-- ============================================================================
--
-- SQL cannot create Storage buckets. Follow these steps in the Dashboard:
--
--   Dashboard → Storage → New bucket
--     Name:   recordings
--     Public: OFF  (leave the toggle disabled — bucket must be PRIVATE)
--
-- Then, still in the Storage section, go to:
--   Policies → recordings bucket → Add policies
--
-- Create the following two policies:
--
-- ── Policy A: Allow anon to UPLOAD (INSERT) ────────────────────────────────
--   Name:          anon_can_upload
--   Allowed ops:   INSERT
--   Role:          anon
--   USING expr:    (leave blank)
--   WITH CHECK:    bucket_id = 'recordings'
--
-- ── Policy B: Allow authenticated to do everything ─────────────────────────
--   (Lets you download/delete recordings from the Dashboard.)
--   Name:          authenticated_full_access
--   Allowed ops:   SELECT, INSERT, UPDATE, DELETE
--   Role:          authenticated
--   USING expr:    bucket_id = 'recordings'
--   WITH CHECK:    bucket_id = 'recordings'
--
-- IMPORTANT:
--   There is NO SELECT policy for anon. Anonymous visitors cannot read or
--   download any recording. Only you (authenticated) can access files.
--
-- ============================================================================


-- ============================================================================
-- 4. VERIFY SETUP
-- ============================================================================

-- After running the above, you can verify the table exists:
-- SELECT * FROM public.submissions LIMIT 5;

-- To verify RLS policies:
-- SELECT schemaname, tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename = 'submissions';
