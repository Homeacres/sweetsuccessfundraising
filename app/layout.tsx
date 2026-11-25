import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SilenceAnnouncer } from "@/components/SilenceAnnouncer";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", display: "optional", adjustFontFallback: true });
const condensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-condensed",
  display: "optional",
  adjustFontFallback: true,
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Sweet Success Fundraising", template: "%s · Sweet Success" },
  description: "Freeze-dried candy fundraisers for local groups. Supporters pay online, and your group keeps $5 on every $12 bag.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${condensed.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <Header />
        <div id="main">{children}</div>
        <Footer />
        <SilenceAnnouncer />
      </body>
    </html>
  );
}
