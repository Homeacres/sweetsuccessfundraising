import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cashReceiptCopy } from "@/lib/cash-receipt";
import { receiptEmail } from "@/lib/email/copy";
import {
  approvedEmail,
  countdownEmail,
  finalDaysEmail,
  launchEmail,
  midpointEmail,
  parentInviteEmail,
  progressEmail,
  requestReceivedEmail,
  wrapUpEmail,
  type LiveLinks,
} from "@/lib/email/flow-copy";
import { prospectQuoteEmail, rosterDraftEmail, type ProspectFields } from "@/lib/email/prospect";
import { outOfAreaMessage } from "@/lib/out-of-area-mail";

const OUT = "/workspace/ssf/screens/email-strip-2026-11-25";
const BANNED = [/skittles|jolly ranch|gummy|haribo/i, /premium/i, /at least 40%/, /\$5 or more/, /DRAFT/];

describe("email strip source", () => {
  it("does not import send, resend, stripe, or supabase", () => {
    const source = readFileSync("tests/render-email-strip.test.ts", "utf8");
    expect(source).not.toMatch(/from ["']@\/lib\/email\/send/);
    expect(source).not.toMatch(/from ["']resend["']/);
    expect(source).not.toMatch(/from ["']stripe["']/);
    expect(source).not.toMatch(/from ["']@\/lib\/supabase\//);
  });
});

describe.skipIf(process.env.RENDER_EMAIL_STRIP !== "1")("email strip", () => {
  it("writes the copy builders and does not send", () => {
    globalThis.fetch = () => {
      throw new Error("email strip must not send");
    };
    const unsub = "https://example.invalid/unsubscribe";
    const fields: ProspectFields = {
      firstName: "Pat",
      teamName: "TEST Hawks Dance",
      goal: "$2,000",
      bags: "400",
      bagsEach: "20",
      startUrl: "https://example.invalid/start",
      unsubscribeUrl: unsub,
      sport: "Dance",
    };
    const live: LiveLinks = {
      firstName: "Pat",
      teamName: "TEST Hawks Dance",
      goal: "$2,000",
      goalPct: 40,
      daysLeft: 6,
      endDate: "Dec 15, 2026",
      salesTotal: "$800.00",
      periodStars: [],
      overallStars: [],
      dashboardUrl: "https://example.invalid/dashboard",
      supporterLinks: [{ name: "Ava", url: "https://example.invalid/shop" }],
      unsubscribeUrl: unsub,
      env: {},
    };
    const emails = [
      ["01-request-received", requestReceivedEmail({ firstName: "Pat", teamName: "TEST Hawks Dance", startWindow: "Nov 15", participants: 12, goal: "$2,000", unsubscribeUrl: unsub, env: {} })],
      ["02-approved", approvedEmail({ firstName: "Pat", teamName: "TEST Hawks Dance", startWindow: "Nov 15", dashboardUrl: "https://example.invalid/dashboard", unsubscribeUrl: unsub, sport: "Dance", env: {} })],
      ["03-roster", rosterDraftEmail({ firstName: "Pat", teamName: "TEST Hawks Dance", rosterUrl: "https://example.invalid/roster", unsubscribeUrl: unsub })],
      ["04-parent-invite", parentInviteEmail({ teamName: "TEST Hawks Dance", startWindow: "Nov 15", goal: "$2,000", signupUrl: "https://example.invalid/join", unsubscribeUrl: unsub, env: {} })],
      ["05-launch", launchEmail(live)],
      ["06-progress", progressEmail(live)],
      ["07-midpoint", midpointEmail(live)],
      ["08-final-days", finalDaysEmail(live)],
      ["09-countdown", countdownEmail({ firstName: "Pat", teamName: "TEST Hawks Dance", signedUp: 4, participants: 12, remaining: 8, daysToLaunch: 3, signupUrl: "https://example.invalid/join", dashboardUrl: "https://example.invalid/dashboard", unsubscribeUrl: unsub, env: {} })],
      ["10-wrap-up", wrapUpEmail(live)],
      ["11-out-of-area", outOfAreaMessage({ firstName: "Pat", postal: "S7K 1A1", unsubscribeUrl: "https://example.invalid/waitlist/unsubscribe/token", keepUrl: "https://example.invalid/waitlist/keep?t=token" }, {})],
      ["12-receipt", receiptEmail({ buyerName: "Pat", team: "TEST Hawks Dance", totalCents: 1200, bags: 1, lines: [], env: {} })],
      ["13-cash-receipt", cashReceiptCopy({ buyerName: "Pat", team: "TEST Hawks Dance", totalCents: 1200, bags: 1, receivedBy: "Alex", receivedAt: null, lines: [], receiptToken: "receipt-token", env: {} })],
      ["14-quote", prospectQuoteEmail(fields, null)],
    ] as const;
    mkdirSync(OUT, { recursive: true });
    const cards: string[] = [];
    for (const [name, mail] of emails) {
      const combined = `${mail.subject}\n${mail.text}\n${mail.html}`;
      for (const pattern of BANNED) expect(combined, name).not.toMatch(pattern);
      expect(combined, name).toContain("The Sweet Success Family");
      writeFileSync(path.join(OUT, `${name}.html`), mail.html);
      writeFileSync(path.join(OUT, `${name}.txt`), mail.text);
      cards.push(`<section><h2>${name}</h2><p>${mail.subject}</p><iframe src="${name}.html" title="${name}"></iframe></section>`);
    }
    writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset="utf-8"><title>Email strip</title><style>iframe{width:390px;height:640px;border:1px solid #ccc;background:#fff}section{display:inline-block;vertical-align:top;margin:12px}</style>${cards.join("")}`);
  });
});
