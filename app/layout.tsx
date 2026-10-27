import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow" });
const condensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-condensed",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Sweet Success Fundraising", template: "%s · Sweet Success" },
  description: "Freeze-dried candy fundraisers for youth sports teams in Alberta. Buyers pay online. The team keeps a share of every bag.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${barlow.variable} ${condensed.variable}`}>
        <a className="skip" href="#main">Skip to content</a>
        <Header />
        <div id="main">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
