/** TEST organizers are named with this prefix. There is no is_test column. */
export function isTestOrganizerName(name: string): boolean {
  return name.trim().toUpperCase().startsWith("TEST ");
}

export function maskPreviewEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "hidden";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function previewKeepEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  return lower.endsWith("@resend.dev") || lower.endsWith(".invalid");
}
