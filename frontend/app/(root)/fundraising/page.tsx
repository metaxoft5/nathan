import type { Metadata } from "next";
import React from "react";
import Hero from "@/components/ui/fundraising/Hero";

export const metadata: Metadata = {
  title:
    "Best Fundraising Ideas for Nonprofit & Charity Organizations | Licorice4Good",
  description:
    "Looking for fun and profitable ways to raise money for your nonprofit or charity? Sell premium licorice candy with Licorice4Good — earn 50% of every sale, no fees, no minimums. The most delicious fundraiser idea for any cause!",
  openGraph: {
    title:
      "Best Fundraising Ideas for Nonprofit & Charity Organizations | Licorice4Good",
    description:
      "Looking for fun and profitable ways to raise money for your nonprofit or charity? Sell premium licorice candy with Licorice4Good — earn 50% of every sale, no fees, no minimums. The most delicious fundraiser idea for any cause!",
    url: "https://licorice4good.com/fundraising",
  },
  twitter: {
    title:
      "Best Fundraising Ideas for Nonprofit & Charity Organizations | Licorice4Good",
    description:
      "Looking for fun and profitable ways to raise money for your nonprofit or charity? Sell premium licorice candy with Licorice4Good — earn 50% of every sale, no fees, no minimums. The most delicious fundraiser idea for any cause!",
  },
};
import Dedication from "@/components/ui/fundraising/Dedication";
import Off from "@/components/ui/fundraising/Off";
import VirtualFund from "@/components/ui/fundraising/VirtualFund";
import GrateFull from "@/components/ui/fundraising/GrateFull";
import Rope from "@/components/ui/fundraising/Rope";

const Fundraising = () => {
  return (
    <>
      <Hero />
      <Dedication />
      <Off />
      <VirtualFund />
      <GrateFull />
      <Rope />
    </>
  );
};

export default Fundraising;
