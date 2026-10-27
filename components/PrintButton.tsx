"use client";

export function PrintButton() {
  return (
    <button className="btn btn-ghost" type="button" onClick={() => window.print()}>
      Print
    </button>
  );
}
