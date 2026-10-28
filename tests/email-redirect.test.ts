import { describe, expect, it } from "vitest";
import { deliverApplyNotices } from "@/lib/apply-email";
import {
  applicationAdminEmail,
  applicationApplicantEmail,
  milestoneEmail,
  outOfAreaAdminEmail,
  receiptEmail,
} from "@/lib/email/copy";
import { resendBody, type OutboundEmail } from "@/lib/email/send";
import { bagEstimate } from "@/lib/estimate";
import type { MilestoneName } from "@/lib/milestones";

const summary = bagEstimate(2000, 20)!;
const testEnv = { EMAIL_TEST_RECIPIENT: "qa@example.com" };

function envelope(to: string, message: { subject: string; html: string; text: string }): OutboundEmail {
  return { to, ...message, cc: ["cc@example.com"], bcc: ["bcc@example.com"] };
}

const messages: { type: string; mail: OutboundEmail }[] = [
  {
    type: "apply_confirmation",
    mail: envelope("pat@example.com", applicationApplicantEmail({ firstName: "Pat", team: "Hawks", summary })),
  },
  {
    type: "apply_confirmation_copy",
    mail: envelope(
      "owner@example.com",
      applicationAdminEmail({
        firstName: "Pat",
        lastName: "Lee",
        email: "pat@example.com",
        phone: "",
        team: "Hawks",
        sport: "Hockey",
        city: "Calgary",
        postal: "T2P 1J9",
        participants: 20,
        goalDollars: 2000,
        howHeard: "",
        consent: false,
        summary,
      }),
    ),
  },
  {
    type: "apply_out_of_area",
    mail: envelope(
      "owner@example.com",
      outOfAreaAdminEmail({
        firstName: "Pat",
        lastName: "Lee",
        email: "pat@example.com",
        city: "Toronto",
        postal: "M5V 2T6",
        province: "ON",
        sport: "Hockey",
      }),
    ),
  },
  {
    type: "buyer_receipt",
    mail: envelope(
      "buyer@example.com",
      receiptEmail({
        buyerName: "Pat",
        team: "Hawks",
        totalCents: 3600,
        bags: 3,
        lines: [{ player: "Sam", candy: "Celly Crunches", qty: 3, grossCents: 3600, mix: false }],
      }),
    ),
  },
  ...(["start", "midpoint", "days_left", "final_day", "close"] as MilestoneName[]).map((kind) => ({
    type: `parent_milestone_${kind}`,
    mail: envelope(
      "parent@example.com",
      milestoneEmail({
        kind,
        team: "Hawks",
        parentFirst: "Pat",
        token: "token",
        players: [{ first: "Sam", last: "Lee", hideLastName: false, bags: 3, teamCents: 1500 }],
        endDate: "2026-11-15",
      }),
    ),
  })),
];

describe("EMAIL_TEST_RECIPIENT", () => {
  it("rewrites to and subject for every email type and keeps the original address out of to, cc, and bcc", () => {
    expect(messages.map((item) => item.type)).toEqual([
      "apply_confirmation",
      "apply_confirmation_copy",
      "apply_out_of_area",
      "buyer_receipt",
      "parent_milestone_start",
      "parent_milestone_midpoint",
      "parent_milestone_days_left",
      "parent_milestone_final_day",
      "parent_milestone_close",
    ]);
    for (const item of messages) {
      const body = resendBody(item.mail, testEnv);
      expect(body.to, item.type).toEqual(["qa@example.com"]);
      expect(body, item.type).not.toHaveProperty("cc");
      expect(body, item.type).not.toHaveProperty("bcc");
      expect(body.subject, item.type).toBe(`[TEST to ${item.mail.to}] ${item.mail.subject}`);
      expect(body.to.join(" "), item.type).not.toContain(item.mail.to);
      expect(JSON.stringify({ to: body.to, cc: (body as { cc?: unknown }).cc, bcc: (body as { bcc?: unknown }).bcc }), item.type).not.toContain(item.mail.to);
    }
  });

  it("leaves the envelope alone and skips the send when neither switch is set", async () => {
    const plain = resendBody({ to: "pat@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi", cc: ["cc@example.com"] }, {});
    expect(plain.to).toEqual(["pat@example.com"]);
    expect(plain.subject).toBe("Hi");
    expect(plain).not.toHaveProperty("cc");

    let called = false;
    const logged: string[] = [];
    const result = await deliverApplyNotices({
      notices: [
        {
          to: "pat@example.com",
          emailType: "apply_confirmation",
          message: applicationApplicantEmail({ firstName: "Pat", team: "Hawks", summary }),
        },
      ],
      env: {},
      send: async () => {
        called = true;
        return "re_should_not_send";
      },
      log: async (row) => {
        logged.push(`${row.status}:${row.recipient}`);
      },
    });
    expect(called).toBe(false);
    expect(result.sent).toBe(false);
    expect(logged).toEqual(["skipped:pat@example.com"]);
  });

  it("sends apply mail to the logger as redirected when only the test inbox is set", async () => {
    const logged: string[] = [];
    const result = await deliverApplyNotices({
      notices: [
        {
          to: "pat@example.com",
          emailType: "apply_confirmation",
          message: applicationApplicantEmail({ firstName: "Pat", team: "Hawks", summary }),
        },
      ],
      env: { EMAIL_TEST_RECIPIENT: "qa@example.com", RESEND_API_KEY: "re_test" },
      send: async (message) => {
        const body = resendBody(message, { EMAIL_TEST_RECIPIENT: "qa@example.com" });
        expect(body.to).toEqual(["qa@example.com"]);
        expect(body.subject.startsWith("[TEST to pat@example.com] ")).toBe(true);
        return "re_test_1";
      },
      log: async (row) => {
        logged.push(`${row.status}:${row.recipient}:${row.resend_id}`);
      },
    });
    expect(result.sent).toBe(true);
    expect(logged).toEqual(["redirected:pat@example.com:re_test_1"]);
  });
});
