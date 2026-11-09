import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { CartLink } from "@/components/CartLink";

// Placeholder typeface; the final look is decided in the design phase
const brand = Bricolage_Grotesque({
  variable: "--font-brand",
  subsets: ["latin"],
});

// Page title and description shown by browsers and search engines
export const metadata: Metadata = {
  title: "Foodie",
  description: "Order from restaurants near you in Pereira.",
};

// Wraps every page, so the font and global styles apply everywhere
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${brand.variable} font-sans antialiased`}>
        {/* FR16: the cart link, on every page except Account (it hides itself) */}
        <CartLink />
        {children}
      </body>
    </html>
  );
}
