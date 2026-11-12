import { CalculatorLink } from "@/components/CalculatorLink";

/** Panel 1's calculator link and the button under the steps. Off until those jumps are confirmed. */
export const SHOW_HOW_IT_WORKS_CTA = false;

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function QuoteIcon() {
  return (
    <Icon>
      <rect x="16" y="4" width="32" height="56" rx="6" />
      <path d="M26 9.5h12" />
      <rect x="20" y="14" width="24" height="16" rx="2" fill="var(--sky)" />
      <text x="25" y="25" fontSize="10" textAnchor="middle">$</text>
      <path d="M31 17.5h7v7.2c0 1.5-1.6 2.6-3.5 2.6s-3.5-1.1-3.5-2.6z" />
      <path d="M32.2 19.8h4.6" />
      <text x="40.2" y="25.2" fontSize="7" textAnchor="middle">12</text>
      <rect x="21" y="34" width="6.5" height="5.5" rx="1.3" />
      <rect x="29" y="34" width="6.5" height="5.5" rx="1.3" />
      <rect x="37" y="34" width="6.5" height="5.5" rx="1.3" />
      <rect x="21" y="41.5" width="6.5" height="5.5" rx="1.3" />
      <rect x="29" y="41.5" width="6.5" height="5.5" rx="1.3" />
      <rect x="37" y="41.5" width="6.5" height="5.5" rx="1.3" />
      <rect x="21" y="49" width="14.5" height="5.5" rx="1.3" />
      <rect x="37" y="49" width="6.5" height="5.5" rx="1.3" />
    </Icon>
  );
}

function ShareIcon() {
  return (
    <Icon>
      <rect x="3" y="12" width="24" height="42" rx="5" />
      <path d="M9 17.5h12" />
      <rect x="8" y="36" width="14" height="10" rx="2" />
      <path d="M15 36V27" />
      <path d="M11.2 30.6 15 27l3.8 3.6" />
      <path d="M27 16h6" />
      <path d="M27 32h8" />
      <path d="M27 50h6" />
      <rect x="33" y="8" width="27" height="14" rx="7" />
      <rect x="35" y="26" width="25" height="13" rx="6.5" />
      <rect x="33" y="44" width="23" height="13" rx="6.5" />
    </Icon>
  );
}

function OrderIcon() {
  return (
    <Icon>
      <rect x="3" y="6" width="16" height="30" rx="3" />
      <path d="M7 11h8" />
      <rect x="7" y="24" width="22" height="15" rx="2" fill="var(--sky)" />
      <rect x="10" y="27.5" width="5" height="4" rx="1" />
      <path d="M18 32.2 20.4 34.6 25.2 29.4" />
      <rect x="38" y="12" width="22" height="32" rx="3" />
      <rect x="44" y="8" width="10" height="7" rx="2" fill="var(--sky)" />
      <path d="M42 20h14M42 26h14M42 32h9" />
      <path d="M46 42l12 8" />
      <path d="M48.2 40.4l12 8" />
      <path d="M58 50l2.4 1.6-3.2 1.2" />
    </Icon>
  );
}

function KitchenIcon() {
  return (
    <Icon>
      <rect x="3" y="6" width="24" height="42" rx="3" />
      <path d="M7 13h16" />
      <circle cx="10" cy="13" r="1" fill="currentColor" stroke="none" />
      <rect x="7" y="17" width="16" height="22" rx="2" />
      <circle cx="15" cy="26" r="4.5" />
      <path d="M10 34h10" />
      <path d="M19 36.5v5" />
      <path d="M32 8h9v11c0 2.2-2 3.8-4.5 3.8S32 21.2 32 19z" />
      <path d="M33.2 11h6.6" />
      <path d="M43 14h9v11c0 2.2-2 3.8-4.5 3.8S43 27.2 43 25z" />
      <path d="M44.2 17h6.6" />
      <rect x="31" y="42" width="16" height="12" rx="2" />
      <path d="M34 42v-4h4v4M40 42v-4h4v4" />
      <path d="M47 48h8c2.2 0 4 1.8 4 4s-1.8 4-4 4h-6" />
      <path d="M47 48c-.6-3.4 1.6-5.6 4.4-4.8" />
    </Icon>
  );
}

function EarnIcon() {
  return (
    <Icon>
      <rect x="4" y="16" width="42" height="10" rx="5" fill="var(--sky)" />
      <rect x="4" y="16" width="26" height="10" rx="5" fill="var(--gold)" stroke="none" />
      <rect x="4" y="16" width="42" height="10" rx="5" />
      <path d="M50 12v20" />
      <path d="M50 12h11l-3.5 5 3.5 5H50z" fill="var(--gold)" />
      <path d="M8 40h12v11c0 2.8-2.6 4.8-6 4.8s-6-2-6-4.8z" />
      <path d="M9.2 43.5h9.6" />
      <rect x="26" y="43" width="30" height="14" rx="3" fill="var(--sky)" />
      <text x="41" y="53" fontSize="9" textAnchor="middle">$5+</text>
      <path d="M20 49h6" />
    </Icon>
  );
}

const STEPS = [
  {
    title: "Get your quote.",
    caption: "Tell us about your group and see what you could raise in seconds.",
    icon: <QuoteIcon />,
    linked: true,
  },
  {
    title: "Sign up and share.",
    caption: "Parents sign up and share their link with family and friends.",
    icon: <ShareIcon />,
    linked: false,
  },
  {
    title: "Supporters order.",
    caption: "Supporters pay online, or parents log cash orders on the order sheet.",
    icon: <OrderIcon />,
    linked: false,
  },
  {
    title: "We make it, you hand it out.",
    caption: "We make your whole order and deliver it to your organizer, ready to hand out.",
    icon: <KitchenIcon />,
    linked: false,
  },
  {
    title: "Your group earns.",
    caption: "Your group makes $5 or more on every bag (at least 40%) and can watch progress live.",
    icon: <EarnIcon />,
    linked: false,
  },
];

function StepBody({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  return (
    <>
      <span className="how-icon">{step.icon}</span>
      <span className="how-titleline">
        <span className="how-num" aria-hidden="true">{index + 1}</span>
        <h3>{step.title}</h3>
      </span>
      <p>{step.caption}</p>
      {index < STEPS.length - 1 ? <span className="how-arrow" aria-hidden="true" /> : null}
    </>
  );
}

export function HowItWorks() {
  return (
    <section className="section alt how-section" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <h2 id="how-title">How Sweet Success works</h2>
        <p className="sub">Five easy steps from first idea to money raised.</p>
        <ol className="how-steps">
          {STEPS.map((step, index) => (
            <li className="how-step" key={step.title}>
              {SHOW_HOW_IT_WORKS_CTA && step.linked ? (
                <CalculatorLink className="how-hit">
                  <StepBody step={step} index={index} />
                </CalculatorLink>
              ) : (
                <div className="how-hit">
                  <StepBody step={step} index={index} />
                </div>
              )}
            </li>
          ))}
        </ol>
        {SHOW_HOW_IT_WORKS_CTA ? (
          <p className="how-actions">
            <CalculatorLink className="btn btn-gold how-cta">Calculate your fundraiser</CalculatorLink>
          </p>
        ) : null}
      </div>
    </section>
  );
}
