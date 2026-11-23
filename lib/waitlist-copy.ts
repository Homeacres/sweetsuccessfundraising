/** Option B. The sender line keeps its brackets until Chris picks the public address and contact. */
export const WAITLIST_HEADING = "We're not in your area yet";

export const WAITLIST_BODY =
  "Thanks for your interest. Sweet Success Fundraising isn't available at that postal code yet. We're currently serving groups in Alberta.";

export const WAITLIST_OPTIONAL =
  "If you'd like, leave your email and we'll let you know if we come to your area.";

export const WAITLIST_CONSENT =
  "Yes, email me if Sweet Success Fundraising Inc. starts serving my area. I can unsubscribe anytime.";

export const WAITLIST_SENDER =
  "Sweet Success Fundraising Inc., [mailing address] · [contact email or website]";

/** Reserved for a later hint. Returns no customer copy. */
export function postalFieldHint(): null {
  return null;
}
