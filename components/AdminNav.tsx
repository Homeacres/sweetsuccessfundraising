import Link from "next/link";

export function AdminNav() {
  return (
    <nav className="admin-nav no-print" aria-label="Admin">
      <Link href="/admin">Campaigns</Link>
      <Link href="/admin/applications">Applications</Link>
    </nav>
  );
}
