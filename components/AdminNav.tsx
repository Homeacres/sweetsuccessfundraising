import Link from "next/link";

export function AdminNav() {
  return (
    <nav className="admin-nav no-print" aria-label="Admin">
      <Link href="/admin">Campaigns</Link>
      <Link href="/admin/applications">Applications</Link>
      <Link href="/admin/reviews">Review</Link>
      <Link href="/admin/inbox">Inbox</Link>
    </nav>
  );
}
