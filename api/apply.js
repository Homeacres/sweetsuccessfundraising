// ============================================================
// SSF — Flow 1: Organizer Application Handler
// POST /api/apply
// Writes organizer to Supabase, validates service area,
// logs CASL consent, sends confirmation + internal alert.
// No npm dependencies — plain fetch, zero build step.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 
