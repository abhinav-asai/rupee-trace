import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rupee Trace — Every Rupee Has a Purpose",
  description: "Plan your income, give every rupee a purpose, and keep track of what remains.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
