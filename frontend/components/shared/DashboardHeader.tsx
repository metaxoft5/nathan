"use client";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import axios from "axios";

const NavLink = ({
  href,
  label,
  onClick,
  disabled = false,
}: {
  href: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) => {
  const pathname = usePathname();
  const isActive = pathname.startsWith(href);
  
  if (disabled) {
    return (
      <span
        className={`block px-3 py-2 rounded-lg text-sm font-medium transition opacity-50 cursor-not-allowed ${
          isActive
            ? "bg-white/15 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
            : "text-white/85"
        }`}
      >
        {label}
      </span>
    );
  }
  
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block px-3 py-2 rounded-lg text-sm font-medium transition ${
        isActive
          ? "bg-white/15 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
          : "text-white/85 hover:bg-white/10"
      }`}
    >
      {label}
    </Link>
  );
};

const DashboardHeader = () => {
  const { user, loading: userLoading, clearUser } = useUser();
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  const [menuOpen, setMenuOpen] = useState(false);

  const onLogout = async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`, {}, { withCredentials: true });
      clearUser(); // Clear user state immediately
      router.replace("/");
    } catch {
      // Even if logout fails, clear local state
      clearUser();
      router.replace("/");
    }
  };

  // Close menu on navigation
  const handleNavClick = () => setMenuOpen(false);

  return (
    <div className="w-full bg-primary sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between border-b border-white/10">
        {/* Left: Logo/Title */}
        <div className="flex items-center gap-2">
          <span className="text-lg sm:text-xl font-extrabold text-white drop-shadow">
            Dashboard
          </span>
          <span className="text-[10px] sm:text-xs text-white/80 hidden sm:inline">Admin</span>
        </div>

        {/* Hamburger for mobile */}
        <button
          className="sm:hidden flex items-center justify-center p-2 rounded-md text-white hover:bg-white/10 focus:outline-none"
          aria-label="Open menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            {menuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 8h16M4 16h16"
              />
            )}
          </svg>
        </button>

        {/* Desktop Nav */}
        <nav className="hidden sm:flex items-center gap-1.5 sm:gap-2">
          {/* <NavLink href="/" label="Home" /> */}
          <NavLink href="/shop" label="Shop" />
          <NavLink href="/dashboard" label="Overview" disabled={userLoading} />
          <NavLink href="/dashboard/orders" label="Orders" disabled={userLoading} />
          <NavLink href="/dashboard/addProducts" label="Products" disabled={userLoading} />
        </nav>

        {/* Desktop User Actions */}
        <div className="hidden sm:flex items-center gap-2 sm:gap-3">
          {user && user.role === "admin" ? (
            <>
              <span className="text-xs sm:text-sm text-white/90">
                {user.name} ({user.role})
              </span>
              <button
                onClick={onLogout}
                className="px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm bg-white/15 text-white hover:bg-white/20 transition shadow-[0_0_0_1px_rgba(255,255,255,0.25)]"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push("/auth/login")}
              className="px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm bg-white/15 text-white hover:bg-white/20 transition shadow-[0_0_0_1px_rgba(255,255,255,0.25)]"
            >
              Login
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="sm:hidden bg-primary border-t border-white/10 px-3 sm:px-4 pb-4">
          <nav className="flex flex-col gap-1 mt-2">
            {/* <NavLink
              href="/"
              label="Home"
              onClick={handleNavClick}
            /> */}
            <NavLink
              href="/shop"
              label="Shop"
              onClick={handleNavClick}
            />
            <NavLink
              href="/dashboard"
              label="Overview"
              onClick={handleNavClick}
              disabled={userLoading}
            />
            <NavLink
              href="/dashboard/orders"
              label="Orders"
              onClick={handleNavClick}
              disabled={userLoading}
            />
            <NavLink
              href="/dashboard/addProducts"
              label="Products"
              onClick={handleNavClick}
              disabled={userLoading}
            />
          </nav>
          <div className="flex flex-col gap-2 mt-3">
            {user && user.role === "admin" ? (
              <>
                <span className="text-xs sm:text-sm text-white/90">
                  {user.name} ({user.role})
                </span>
                <button
                  onClick={() => {
                    onLogout();
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 rounded-md text-xs sm:text-sm bg-white/15 text-white hover:bg-white/20 transition shadow-[0_0_0_1px_rgba(255,255,255,0.25)]"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  router.push("/auth/login");
                  setMenuOpen(false);
                }}
                className="w-full px-3 py-1.5 rounded-md text-xs sm:text-sm bg-white/15 text-white hover:bg-white/20 transition shadow-[0_0_0_1px_rgba(255,255,255,0.25)]"
              >
                Login
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardHeader;
