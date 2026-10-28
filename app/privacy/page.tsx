export const metadata = { title: "Privacy", robots: { index: true } };

export default function PrivacyPage() {
  return (
    <main className="page wrap">
      <h1>Privacy</h1>
      <p>Sweet Success Fundraising collects organizer, parent, player, and buyer details to run candy fundraisers for Alberta teams.</p>
      <h2>What we store</h2>
      <p>Applications include your name, email, phone, team, sport, city, and postal code. Orders include the buyer's name, email, optional phone, and which players the bags are for. We do not collect a shipping address. Payment card numbers are handled by Stripe, not stored here.</p>
      <h2>Email</h2>
      <p>Order receipts are transactional and are sent for every paid order. Fundraising tips and parent campaign updates are sent only if you opt in (organizers) or until a parent uses the unsubscribe link in a campaign email. The organizer consent box is unchecked until you tick it.</p>
      <h2>Who can see it</h2>
      <p>Team shop pages show the player name the family chose (or a first name and last initial). The parent leaderboard is available only with a private link. Organizer pick lists are on a password-protected admin page.</p>
      <p>Questions: <a href="mailto:hello@sweetsuccessfundraising.com">hello@sweetsuccessfundraising.com</a>.</p>
    </main>
  );
}
