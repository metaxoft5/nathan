import React from "react";
import DashboardHeader from "@/components/shared/DashboardHeader";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <DashboardHeader />
      <main className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</main>
    </div>
  );
}
