import { ApplyForm } from "@/components/ApplyForm";
import { HowItWorks } from "@/components/HowItWorks";
import { ProductPhotoView } from "@/components/ProductPhoto";
import { bearsPhoto, fruitChewsPhoto, spheresPhoto } from "@/components/product-photos";
import { sportListUnavailable, type SportChoice } from "@/lib/apply-sport";
import { listSports } from "@/lib/catalog";
import { supabaseConfigured } from "@/lib/env";
import { TEAM_KEEP_ABOUT } from "@/lib/quote-copy";

export default async function HomePage() {
  let sports: SportChoice[] = [];
  let sportsError = false;
  const configured = supabaseConfigured();
  if (!configured) {
    sportsError = true;
    console.error("sport list failed: supabase is not configured");
  } else {
    try {
      sports = await listSports();
      if (sportListUnavailable(sports)) {
        sports = [];
        sportsError = true;
        console.error("sport list failed: no sports with product names");
      }
    } catch (error) {
      sports = [];
      sportsError = true;
      console.error("sport list failed", error instanceof Error ? error.message : "error");
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <span className="eyebrow">Alberta teams, clubs and groups</span>
            <h1>Raise more.<br /><em>Stress less.</em></h1>
            <p className="lede">
              Freeze-dried candy fundraisers for local groups. Supporters pay online, we make and deliver the order, and your organizer hands it out.
            </p>
            <div className="stats">
              <div><strong className="stat-phrase">Pay online or by order sheet</strong></div>
              <div><strong>$0</strong><span>upfront to your group</span></div>
            </div>
            <p>{TEAM_KEEP_ABOUT}</p>
          </div>
          <div>
            {!configured && <p className="lede">The application form needs the server environment before it can save.</p>}
            <ApplyForm sports={sports} sportsError={sportsError} />
          </div>
        </div>
      </section>

      <HowItWorks />

      <section className="section" id="products">
        <div className="wrap">
          <p className="kicker">What we sell</p>
          <h2>Freeze-dried candy your fans will actually want</h2>
          <p className="sub">Three candies, named for your activity on your group's page. Sold by the bag.</p>
          <div className="grid-3" style={{ marginTop: 28 }}>
            <article className="panel">
              <ProductPhotoView photo={fruitChewsPhoto} />
              <p className="kicker">Hockey</p>
              <h3>Celly Crunches</h3>
              <p>Freeze-dried fruit chews with a light, loud crunch. Named for the celebration.</p>
            </article>
            <article className="panel">
              <ProductPhotoView photo={bearsPhoto} />
              <p className="kicker">Dance and gymnastics</p>
              <h3>Backflip Bears</h3>
              <p>Freeze-dried bears with a snap. A favourite at recitals and meets.</p>
            </article>
            <article className="panel">
              <ProductPhotoView photo={spheresPhoto} />
              <p className="kicker">Baseball</p>
              <h3>Moon Balls</h3>
              <p>Freeze-dried hard candy puffed into airy spheres. Intense flavour, one bite.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section navy" id="about">
        <div className="wrap">
          <p className="kicker" style={{ color: "#e8c85a" }}>Why groups choose us</p>
          <h2>Fundraising that's easy to run.</h2>
          <div className="grid-3" style={{ marginTop: 28 }}>
            <article className="panel">
              <h3>Nothing to pay up front.</h3>
              <p>No upfront cost and no minimum order. Start with what your group needs.</p>
            </article>
            <article className="panel">
              <h3>Easy payments.</h3>
              <p>Supporters pay online, and parents can log cash orders and pay the total by card. Your organizer has nothing to count.</p>
            </article>
            <article className="panel">
              <h3>We handle the candy.</h3>
              <p>We make your whole order and deliver it to your organizer, ready to hand out.</p>
            </article>
          </div>
          <p style={{ marginTop: 28 }}>Your group makes $5 or more on every bag (at least 40% of every sale), and you can watch progress live.</p>
          <p style={{ marginTop: 16 }}><a className="btn btn-gold" href="#apply">Calculate your fundraiser</a></p>
        </div>
      </section>
    </main>
  );
}
