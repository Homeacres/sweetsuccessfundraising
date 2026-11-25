export function bagWord(count: number): string {
  return count === 1 ? "bag" : "bags";
}

export function bagCount(count: number): string {
  const n = Math.trunc(count);
  return `${n} ${bagWord(n)}`;
}

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

export function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
