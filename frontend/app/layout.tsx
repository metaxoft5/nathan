import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import "@/styles/globals.css";
import { Lenis } from "@/constant/lenis";
import GlobalVerificationCheck from "@/components/auth/GlobalVerificationCheck";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nathan Candy Shop - Sweetest E-commerce Experience",
  description:
    "Discover and shop the best selection of candies online at Nathan Candy Shop. Enjoy a delightful e-commerce experience with a wide variety of sweets, treats, and exclusive offers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <Lenis root>
        <body className={`${archivo.variable} ${inter.variable} antialiased`}>
          <GlobalVerificationCheck />
          {children}
        </body>
      </Lenis>
    </html>
  );
}
