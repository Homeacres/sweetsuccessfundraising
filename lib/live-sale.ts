/**
 * Orders and remittances stay is_test=true until Chris approves Production.
 * Set SSF_APPROVED_PRODUCTION=true only on that approved Production deploy.
 * Preview must leave it unset. The migration never flips existing rows.
 */
export function rowIsTest(env: Record<string, string | undefined> = process.env): boolean {
  return env.SSF_APPROVED_PRODUCTION !== "true";
}
