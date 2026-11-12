"use client";

import type { ReactNode } from "react";

/** Scrolls to the quote calculator even when the URL is already #apply. */
export function CalculatorLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <a
      className={className}
      href="#apply"
      onClick={(event) => {
        const target = document.getElementById("apply");
        if (!target) return;
        event.preventDefault();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}
