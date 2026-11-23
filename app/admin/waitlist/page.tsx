import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { matchPostalArea } from "@/lib/area";
import { eligibleForAreaNotice } from "@/lib/area-waitlist";
import { isAdminRequest } from "@/lib/admin-auth";
import { loadPostalAreas } from "@/lib/postal-areas";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Waitlist", robots: { index: false, follow: false } };

type Bucket = { country: string; prefix: string; waitlist: number; rejections: number; served: boolean };

export default async function WaitlistAdminPage() {
  if (!(await isAdminRequest())) redirect("/admin/login");
  const db = supabaseAdmin();
  const [peopleRes, tallyRes, areas] = await Promise.all([
    db.from("area_waitlist").select("country, postal_prefix, unsubscribed_at, consent_type, consented_at"),
    db.from("rejected_area_tallies").select("country, prefix, rejection_count"),
    loadPostalAreas(),
  ]);
  if (peopleRes.error) throw peopleRes.error;
  if (tallyRes.error) throw tallyRes.error;

  const buckets = new Map<string, Bucket>();
  function bucket(country: string, prefix: string): Bucket {
    const key = `${country}:${prefix}`;
    const current = buckets.get(key);
    if (current) return current;
    const served = matchPostalArea(prefix, areas).ok;
    const created = { country, prefix, waitlist: 0, rejections: 0, served };
    buckets.set(key, created);
    return created;
  }
  for (const row of peopleRes.data ?? []) {
    if (row.unsubscribed_at) continue;
    bucket(row.country, row.postal_prefix).waitlist += 1;
  }
  for (const row of tallyRes.data ?? []) {
    bucket(row.country, row.prefix).rejections += row.rejection_count;
  }
  const rows = [...buckets.values()].sort((a, b) => a.prefix.localeCompare(b.prefix) || a.country.localeCompare(b.country));

  return (
    <main className="page wrap">
      <h1>Waitlist</h1>
      <AdminNav />
      <div className="table-wrap panel">
        <table>
          <thead>
            <tr><th>Prefix</th><th>Waitlist</th><th>Rejections</th><th>Now served</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.country}-${row.prefix}`}>
                <td>{row.prefix}</td>
                <td>{row.waitlist}</td>
                <td>{row.rejections}</td>
                <td>{row.served ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p>No rows yet.</p> : null}
      </div>
      <div className="table-wrap panel">
        <table>
          <thead>
            <tr><th>Prefix</th><th>Consent</th><th>Older than 6 months</th></tr>
          </thead>
          <tbody>
            {(peopleRes.data ?? []).filter((row) => !row.unsubscribed_at).map((row, index) => {
              const consentType = row.consent_type === "express" ? "express" : "implied";
              const eligible = eligibleForAreaNotice({
                unsubscribedAt: row.unsubscribed_at,
                consentType,
                consentedAt: row.consented_at,
              });
              return (
                <tr key={`${row.postal_prefix}-${index}`}>
                  <td>{row.postal_prefix}</td>
                  <td>{consentType}</td>
                  <td>{consentType === "implied" && !eligible ? "Yes" : "No"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted"><Link href="/admin">Campaigns</Link></p>
    </main>
  );
}
