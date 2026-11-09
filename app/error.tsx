"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page wrap">
      <h1>Something went wrong</h1>
      <p>Please try again in a moment.</p>
      <button className="btn btn-navy" type="button" onClick={reset} style={{ width: "auto" }}>Try again</button>
    </main>
  );
}
