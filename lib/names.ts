/** Matches public.fn_player_display_name: hidden last name becomes "First L." */
export function playerDisplayName(first: string, last: string | null | undefined, hide: boolean): string {
  const f = (first || "").trim();
  const l = (last || "").trim();
  if (!l) return f;
  if (hide) return `${f} ${l.slice(0, 1).toUpperCase()}.`;
  return `${f} ${l}`;
}
