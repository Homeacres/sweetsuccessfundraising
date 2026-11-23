"use client";

import { useEffect } from "react";

/** Next's route announcer is an empty role=alert. Only the out-of-area result should use that role. */
export function silenceRouteAnnouncer(doc: Pick<Document, "getElementsByName" | "querySelectorAll">): void {
  const hosts = doc.getElementsByName("next-route-announcer");
  for (const host of Array.from(hosts)) {
    const node = host.shadowRoot?.getElementById("__next-route-announcer__");
    if (node?.getAttribute("role") === "alert") node.setAttribute("role", "status");
  }
  doc.querySelectorAll('[role="alert"]').forEach((node) => {
    if (node.id === "out-of-area") return;
    if (!(node.textContent || "").trim()) node.removeAttribute("role");
  });
}

export function SilenceAnnouncer() {
  useEffect(() => {
    silenceRouteAnnouncer(document);
  }, []);
  return null;
}
