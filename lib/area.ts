const POSTAL_PROVINCE: Record<string, string> = {
  A: "NL",
  B: "NS",
  C: "PE",
  E: "NB",
  G: "QC",
  H: "QC",
  J: "QC",
  K: "ON",
  L: "ON",
  M: "ON",
  N: "ON",
  P: "ON",
  R: "MB",
  S: "SK",
  T: "AB",
  V: "BC",
  Y: "YT",
};

export type PostalArea = {
  prefix: string;
  country: "CA" | "US";
  isActive: boolean;
};

export type AreaResult =
  | { ok: true; postal: string; province: string | null; country: "CA" | "US"; prefix: string }
  | { ok: false; reason: "invalid" | "out_of_area"; postal: string; province: string | null };

export function normalizePostal(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function countryOf(postal: string): "CA" | "US" | null {
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postal)) return "CA";
  if (/^[A-Z]([0-9][A-Z0-9]?)?$/.test(postal)) return "CA";
  if (/^\d{5}(\d{4})?$/.test(postal)) return "US";
  return null;
}

function prefixCandidates(postal: string, country: "CA" | "US"): string[] {
  const head = country === "CA" ? (postal.length >= 6 ? postal.slice(0, 3) : postal) : postal.slice(0, 5);
  const prefixes: string[] = [];
  for (let length = head.length; length >= 1; length -= 1) prefixes.push(head.slice(0, length));
  return prefixes;
}

/** Longest stored prefix wins. A switched-off match is a rejection, with no shorter fallback. */
export function matchPostalArea(postalInput: string, areas: PostalArea[]): AreaResult {
  const postal = normalizePostal(postalInput);
  const country = countryOf(postal);
  const province = POSTAL_PROVINCE[postal[0]] ?? null;
  if (!country) return { ok: false, reason: "invalid", postal, province: null };
  const candidates = new Set(prefixCandidates(postal, country));
  const matches = areas
    .filter((area) => area.country === country && candidates.has(area.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length || a.prefix.localeCompare(b.prefix));
  const best = matches[0];
  if (!best || !best.isActive) return { ok: false, reason: "out_of_area", postal, province };
  return { ok: true, postal, province, country, prefix: best.prefix };
}

/** FSA or 3-digit ZIP for a genuine out-of-area code. Invalid formats return null and must not be tallied. */
export function tallyPrefix(postalInput: string, areas: PostalArea[]): { country: "CA" | "US"; prefix: string } | null {
  const area = matchPostalArea(postalInput, areas);
  if (area.ok || area.reason !== "out_of_area") return null;
  const postal = area.postal;
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postal) || /^[A-Z]\d[A-Z]$/.test(postal)) {
    return { country: "CA", prefix: postal.slice(0, 3) };
  }
  if (/^\d{5}(\d{4})?$/.test(postal)) return { country: "US", prefix: postal.slice(0, 3) };
  return null;
}

export function formatPostal(compact: string): string {
  if (compact.length !== 6) return compact;
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}
