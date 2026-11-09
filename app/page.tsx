import { ApplyForm } from "@/components/ApplyForm";
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
              Freeze-dried candy fundraisers for local groups. Buyers pay online, we make and deliver the order, and your organizer hands it out. No cash to collect.
            </p>
            <div className="stats">
              <div><strong>100%</strong><span>paid online</span></div>
              <div><strong>$0</strong><span>upfront to the team</span></div>
              <div><strong>$0</strong><span>cash to handle</span></div>
            </div>
            <p>{TEAM_KEEP_ABOUT}</p>
          </div>
          <div>
            {!configured && <p className="lede">The application form needs the server environment before it can save.</p>}
            <ApplyForm sports={sports} sportsError={sportsError} />
          </div>
        </div>
      </section>

      <section className="section alt" id="how">
        <div className="wrap">
          <p className="kicker">The process</p>
          <h2>Up and running fast</h2>
          <p className="sub">From the first quote to the first sale. We handle the shop. You hand out the order.</p>
          <p>{TEAM_KEEP_ABOUT}</p>
          <div className="grid-3" style={{ marginTop: 28 }}>
            <article className="panel">
              <div className="step-no">01</div>
              <h3>Calculate your fundraiser</h3>
              <p>Tell us about your group. The estimate stays on this page. No paperwork.</p>
            </article>
            <article className="panel">
              <div className="step-no">02</div>
              <h3>Share your link</h3>
              <p>Each participant gets a link to text. Buyers can split one order across several participants.</p>
            </article>
            <article className="panel">
              <div className="step-no">03</div>
              <h3>We deliver, you hand out</h3>
              <p>Buyers pay by card. We produce the candy and deliver it in bulk to the organizer.</p>
            </article>
          </div>
        </div>
      </section>

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
        <div className="wrap grid-2">
          <div>
            <p className="kicker" style={{ color: "#e8c85a" }}>About us</p>
            <h2>Built for local groups, by someone who gets it.</h2>
          </div>
          <div>
            <p>Sweet Success exists so teams spend less time chasing cash. Production and delivery stay local. Every sale is paid online. Parents share a link, buyers pick a participant, and the organizer gets one delivery plus a pick list.</p>
            <p>No inventory on your bench. No upfront cost. No minimum order to launch.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
