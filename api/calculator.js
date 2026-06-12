// ============================================================
// SSF — Flow 1: Calculator / Estimate Handler
// POST /api/calculator
// Writes lead to Supabase, computes bag estimates server-side,
// looks up sport product names, generates AI paragraph (optional),
// sends estimate email via Resend.
// No npm dependencies — plain fetch, zero build step.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || null;
const FROM = 
