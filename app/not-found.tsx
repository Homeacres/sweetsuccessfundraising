import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page wrap">
      <h1>Page not found</h1>
      <p>That link doesn't match a page or a team fundraiser.</p>
      <p><Link href="/">Sweet Success Fundraising</Link></p>
    </main>
  );
}
