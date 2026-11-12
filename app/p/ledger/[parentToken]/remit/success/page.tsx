import { isUnguessableToken } from "@/lib/ledger-rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "Remittance", robots: { index: false, follow: false } };

export default async function RemitSuccessPage({ params }: { params: Promise<{ parentToken: string }> }) {
  const { parentToken } = await params;
  if (!isUnguessableToken(parentToken)) {
    return (
      <main className="page wrap">
        <h1>Link not valid</h1>
      </main>
    );
  }
  return (
    <main className="page wrap">
      <p className="kicker">Sweet Success</p>
      <h1>Payment sent</h1>
      <p>If the card payment went through, those cash orders stay marked cash received and also show paid to Sweet Success. It can take a moment to confirm.</p>
      <p><a href={`/p/ledger/${parentToken}`}>Back to the ledger</a></p>
    </main>
  );
}
