import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const brand = Bricolage_Grotesque({
  variable: "--font-brand",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Foodie",
  description: "Order from restaurants near you in Pereira.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${brand.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
