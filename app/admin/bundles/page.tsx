import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { isAdminRequest } from "@/lib/admin-auth";
import { plainBundleSaveError } from "@/lib/bundles";
import { formatCad } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Bundles", robots: { index: false, follow: false } };

export default async function BundlesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  if (!(await isAdminRequest())) redirect("/admin/login");
  const { error, saved } = await searchParams;
  const { data, error: loadError } = await supabaseAdmin()
    .from("bundle_offers")
    .select("offer_id, label, description, bag_count, price_cents, team_share_cents, is_active, is_test, sort_order")
    .order("sort_order");
  if (loadError) throw loadError;

  return (
    <main className="page wrap">
      <h1>Bundles</h1>
      <AdminNav />
      {saved ? <p className="alert">Saved.</p> : null}
      {error ? <p className="alert error">{plainBundleSaveError(error)}</p> : null}
      <div className="grid-2">
        {(data ?? []).map((offer) => (
          <form key={offer.offer_id} className="panel" action={`/api/admin/bundles/${offer.offer_id}`} method="post">
            <p className="muted">{offer.bag_count} bags · {formatCad(offer.price_cents)} · group keeps {formatCad(offer.team_share_cents)}</p>
            <label htmlFor={`label-${offer.offer_id}`}>Label</label>
            <input id={`label-${offer.offer_id}`} name="label" required defaultValue={offer.label} />
            <label htmlFor={`description-${offer.offer_id}`}>Description</label>
            <textarea id={`description-${offer.offer_id}`} name="description" defaultValue={offer.description ?? ""} />
            <label htmlFor={`price-${offer.offer_id}`}>Price ($)</label>
            <input id={`price-${offer.offer_id}`} name="priceDollars" type="number" min="0.01" step="0.01" required defaultValue={(offer.price_cents / 100).toFixed(2)} />
            <label htmlFor={`share-${offer.offer_id}`}>Group keeps ($)</label>
            <input id={`share-${offer.offer_id}`} name="shareDollars" type="number" min="0" step="0.01" required defaultValue={(offer.team_share_cents / 100).toFixed(2)} />
            <label className="check">
              <input type="checkbox" name="is_active" value="1" defaultChecked={offer.is_active} />
              <span>Active</span>
            </label>
            <label className="check">
              <input type="checkbox" name="is_test" value="1" defaultChecked={offer.is_test} />
              <span>Test pricing</span>
            </label>
            <button className="btn btn-navy" type="submit">Save</button>
          </form>
        ))}
      </div>
    </main>
  );
}
