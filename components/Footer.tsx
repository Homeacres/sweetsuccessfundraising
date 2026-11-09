export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <a className="logo" href="/">sweet <span>success</span></a>
        <p>Freeze-dried candy fundraisers for Alberta teams, clubs and groups. Orders are paid online and delivered in bulk to your organizer.</p>
        <p>
          <a href="mailto:hello@sweetsuccessfundraising.com">hello@sweetsuccessfundraising.com</a>
          {" · "}
          <a href="/privacy">Privacy</a>
        </p>
        <p>© {new Date().getFullYear()} Sweet Success Fundraising. Locally produced and delivered.</p>
      </div>
    </footer>
  );
}
