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

export type AreaResult =
  | { ok: true; postal: string; province: string }
  | { ok: false; reason: "invalid" | "out_of_area"; postal: string; province: string | null };

export function normalizePostal(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function checkServiceArea(postalInput: string, serviceProvinces: string[]): AreaResult {
  const postal = normalizePostal(postalInput);
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postal)) {
    return { ok: false, reason: "invalid", postal, province: null };
  }
  const province = POSTAL_PROVINCE[postal[0]] ?? null;
  if (!province || !serviceProvinces.includes(province)) {
    return { ok: false, reason: "out_of_area", postal, province };
  }
  return { ok: true, postal, province };
}

export function formatPostal(compact: string): string {
  if (compact.length !== 6) return compact;
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}
