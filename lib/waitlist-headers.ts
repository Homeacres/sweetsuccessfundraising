/** Headers for a later approved email. This build does not send that email. POST only. */
export function waitlistUnsubscribeHeaders(origin: string, token: string): Record<string, string> {
  const url = `${origin.replace(/\/$/, "")}/api/waitlist/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
