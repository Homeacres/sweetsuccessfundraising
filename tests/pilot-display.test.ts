import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cashReceiptCopy } from "@/lib/cash-receipt";
import { receiptEmail } from "@/lib/email/copy";
import { gstIncludedCents, gstIncludedLine, gstNumberLine, receiptMoneyLines } from "@/lib/gst";
import { isTestOrganizerName } from "@/lib/preview-links";
import { bagCount } from "@/lib/text";

describe("GST display", () => {
  it("splits included GST without a half-cent tie", () => {
    expect(gstIncludedCents(1200)).toBe(57);
    expect(gstIncludedCents(12000)).toBe(571);
    expect(gstIncludedLine(3600)).toBe("Includes GST (5%) $1.71");
  });

  it("prints the number line only when the env var is set", () => {
    expect(gstNumberLine({})).toBeNull();
    expect(gstNumberLine({ SSF_GST_NUMBER: "  " })).toBeNull();
    expect(gstNumberLine({ SSF_GST_NUMBER: "TEST-GST" })).toBe("GST number: TEST-GST");
    const receipt = receiptEmail({
      buyerName: "Pat",
      team: "TEST Hawks Dance",
      totalCents: 1200,
      bags: 1,
      lines: [],
      env: { SSF_GST_NUMBER: "TEST-GST" },
    });
    expect(receipt.text).toContain("Includes GST (5%) $0.57");
    expect(receipt.text).toContain("Questions? Email hello@sweetsuccessfundraising.com.");
    expect(receipt.text).toContain("The Sweet Success Family");
    expect(receipt.text).toContain("GST number: TEST-GST");
    expect(receipt.text).toContain("Sweet Success Fundraising Inc.");
    expect(receipt.text).toContain("1 bag");
    const hidden = receiptMoneyLines(1200, {});
    expect(hidden.join("\n")).not.toContain("GST number:");
    const cash = cashReceiptCopy({
      buyerName: "Pat",
      team: "TEST Hawks Dance",
      totalCents: 1200,
      bags: 1,
      receivedBy: "Alex",
      receivedAt: null,
      lines: [],
      receiptToken: "a".repeat(32),
      env: {},
    });
    expect(cash.text).toContain("Includes GST (5%) $0.57");
    expect(cash.text).toContain("The Sweet Success Family");
    expect(cash.text).toContain("Sweet Success Fundraising Inc.");
    expect(cash.text).toContain("1 bag");
    expect(cash.text).not.toContain("1 bags");
    expect(readFileSync("app/r/[receiptToken]/page.tsx", "utf8")).toContain("bagCount");
  });
});

describe("bag plurals", () => {
  it("uses bag for one and bags for more", () => {
    expect(bagCount(1)).toBe("1 bag");
    expect(bagCount(2)).toBe("2 bags");
  });
});

describe("preview link guards", () => {
  it("blocks production before the admin check and lists only TEST names", () => {
    const page = readFileSync("app/admin/preview-links/page.tsx", "utf8");
    const body = page.slice(page.indexOf("export default"));
    expect(body.indexOf('VERCEL_ENV === "production"')).toBeLessThan(body.indexOf("isAdminRequest"));
    expect(page).toContain('notFound()');
    expect(page).toContain('redirect("/admin/login")');
    expect(page).toContain('ilike("organization_name", "TEST %")');
    expect(isTestOrganizerName("TEST Hawks Dance")).toBe(true);
    expect(isTestOrganizerName("Preview Hawks")).toBe(false);
    expect(isTestOrganizerName("QA Band")).toBe(false);
  });
});
