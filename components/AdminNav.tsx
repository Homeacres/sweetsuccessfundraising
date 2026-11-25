import Link from "next/link";

export function AdminNav() {
  return (
    <nav className="admin-nav no-print" aria-label="Admin">
      <Link href="/admin">Campaigns</Link>
      <Link href="/admin/applications">Applications</Link>
      <Link href="/admin/reviews">Review</Link>
      <Link href="/admin/inbox">Inbox</Link>
      <Link href="/admin/bundles">Bundles</Link>
      <Link href="/admin/waitlist">Waitlist</Link>
      {process.env.VERCEL_ENV !== "production" ? <Link href="/admin/preview-links">Preview links</Link> : null}
    </nav>
  );
}
