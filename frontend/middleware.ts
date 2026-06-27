import { NextRequest, NextResponse } from "next/server";

// List of routes that should only be accessible to guests (not logged in)
const GUEST_ONLY_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
];

// Routes that don't require authentication (including verification pages)
const PUBLIC_PATHS = [
  "/auth/verify-email",
  "/auth/verify-success",
  "/",
  "/shop",
  "/products",
];

// Routes that require email verification
const VERIFICATION_REQUIRED_PATHS = [
  "/cart",
  "/checkout", 
  "/orders",
  "/profile",
  "/dashboard",
];

// List of routes that require authentication
const AUTH_REQUIRED_PATHS = [
  "/cart",
  "/checkout",
  "/orders",
  // add more protected routes as needed
];
const ADMIN_ONLY_PATHS = ["/dashboard"];

// Helper to check if path matches any in a list
function matchesPath(path: string, patterns: string[]) {
  return patterns.some((pattern) => path.startsWith(pattern));
}

// JWT verification is handled by the backend API
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
  // Get authentication token from cookies
  const rawToken =
    req.cookies.get("token")?.value ||
    req.cookies.get("auth_token")?.value ||
    req.cookies.get("jwt")?.value ||
    req.cookies.get("accessToken")?.value;
  
  // Check for presence of auth cookie - let client-side handle validation
  const hasAuthCookie = !!rawToken;

  // 1. Redirect logged-in users away from guest-only pages
  if (hasAuthCookie && matchesPath(pathname, GUEST_ONLY_PATHS)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // 2. Allow public paths without authentication
  if (matchesPath(pathname, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  // 3. Require authentication for protected pages
  if (!hasAuthCookie && matchesPath(pathname, AUTH_REQUIRED_PATHS)) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }
  
  // 4. For verification-required pages, require authentication
  if (matchesPath(pathname, VERIFICATION_REQUIRED_PATHS)) {
    if (!hasAuthCookie) {
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }
    // Let client-side VerificationGuard handle verification status
  }
  
  // 5. For admin pages, require authentication
  if (matchesPath(pathname, ADMIN_ONLY_PATHS)) {
    if (!hasAuthCookie) {
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }
  }

  // 6. Allow all other requests
  return NextResponse.next();
}

// Apply middleware to all routes except static, _next, and api
export const config = {
  matcher: ["/((?!_next|favicon.ico|api|public).*)"],
};
