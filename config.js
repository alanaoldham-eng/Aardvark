// =====================================================================
// Aardvark configuration — the ONLY file to edit when connecting Supabase
// or moving to a new host. Nothing here is secret: the Supabase
// "publishable"/"anon" key is designed to be public, and the database's
// Row Level Security rules (supabase/schema.sql) decide what it can do.
// NEVER put the "secret" / "service_role" key in this file.
// =====================================================================
window.AARDVARK_CONFIG = {
  // Supabase → Project Settings → API (or "Connect")
  supabaseUrl: "",   // e.g. "https://abcdefghijkl.supabase.co"
  supabaseKey: "",   // the publishable (sb_publishable_…) or anon key

  // Leave both empty to run the app on built-in sample data (demo mode).
};
