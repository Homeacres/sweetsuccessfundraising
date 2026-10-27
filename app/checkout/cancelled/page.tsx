import Link from "next/link";

export const metadata = { title: "Checkout cancelled", robots: { index: false, follow: false } };

export default function CancelledPage() {
  return (
    <main className="page wrap">
      <h1>No charge</h1>
      <p>Checkout was cancelled before payment. You can open the team link again and place the order when you're ready.</p>
      <p><Link href="/">Back to Sweet Success</Link></p>
    </main>
  );
}
