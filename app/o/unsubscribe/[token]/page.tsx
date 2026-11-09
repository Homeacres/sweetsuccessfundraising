import { recordOrganizerUnsubscribe } from "@/lib/organizer-actions";

export const metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await recordOrganizerUnsubscribe(token);
  return (
    <main className="page wrap">
      <h1>{result === "ok" ? "You're unsubscribed" : "This link is not valid"}</h1>
      <p>
        {result === "ok"
          ? "We won't send more follow-ups about this estimate. You're welcome back anytime."
          : "Ask us for a new link if you still want to stop the emails."}
      </p>
    </main>
  );
}
