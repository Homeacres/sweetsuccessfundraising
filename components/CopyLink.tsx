"use client";

import { useState } from "react";

export function CopyLink({ href, label }: { href: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="qty-line">
      <div>
        <strong>{label}</strong>
        <div className="muted">{href}</div>
      </div>
      <button
        className="btn btn-ghost"
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(href);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
