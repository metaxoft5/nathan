# Nathan Frontend – Comprehensive Next.js Candy E‑commerce Storefront & Administrative Platform

Welcome to the Nathan Frontend repository, the official codebase for a modern, enterprise‑grade candy e‑commerce platform. This application delivers a polished, mobile‑first shopping experience and a powerful administrative dashboard that enables efficient store operations at scale. Built on Next.js (App Router), Zustand state management, and a utility‑first CSS approach, the platform emphasizes performance, security, maintainability, and long‑term extensibility.

---

## Table of Contents
- Overview & Vision
- Core Features
- Architecture & Technology Stack
- Project Structure
- Data & API Integration
- Authentication & Authorization
- Admin Dashboard (Back‑Office)
- State Management (Zustand)
- Styling, UX, and Accessibility
- Environment & Configuration
- Local Development
- Production Build & Deployment
- Reverse Proxy & API Proxying
- Images, Assets, and Uploads
- Observability & Error Handling
- Security Best Practices
- Performance Optimizations
- SEO & Marketing
- Internationalization & Localization (Roadmap)
- Affiliate System (Roadmap)
- Mobile Application (Roadmap)
- Testing Strategy (Roadmap)
- Troubleshooting & FAQ
- Contributing Guidelines
- License

---

## Overview & Vision
Nathan Frontend provides:
- A user‑centric, conversion‑focused storefront that showcases candy products, including flavor compositions and curated “3‑pack” bundles.
- A robust admin area for product management (with images and flavors), stock visibility, and efficient order oversight.
- A foundation for future growth including a full affiliate program and companion mobile apps.

Business vision:
- Enable rapid product iteration and launches (e.g., seasonal flavors, bundles).
- Provide an exceptional mobile experience to meet modern shopping behavior.
- Offer clean integrations with third‑party services (payments, analytics, communications).

---

## Core Features
User‑facing:
- Product catalog with flavor metadata and stock indicators
- Product detail pages with rich content and images
- Wishlist and cart with persistent state and backend sync
- Order history and friendly auth flows (login, register, forgot/reset)

Admin:
- Product CRUD with server‑side pagination and image upload
- Flavor-aware product composition (display and persistence)
- Orders list with filters and status updates
- (Roadmap) Inventory dashboards and analytics

Platform:
- Strict routing and auth gate via middleware to avoid guest‑page flicker when logged in
- Mobile‑first, responsive components with accessible interactions
- Clear separation of concerns and documented integration patterns

---

## Architecture & Technology Stack
- Framework: Next.js (App Router)
- Language: TypeScript
- State: Zustand (cart, orders, wishlist)
- Styles: Utility‑first CSS (Tailwind‑like classes in codebase)
- Auth: httpOnly cookie flow provided by backend; middleware enforces redirect rules
- Networking: Fetch/axios using `NEXT_PUBLIC_API_URL` or proxy routes (rewrites)
- Images: Next.js Image with safe remote patterns for backend assets

---

## Project Structure
```
app/
  (root)/              # main storefront routes (home, shop, products, profile, etc.)
  auth/                # login, register, forgot password, reset password
  dashboard/           # administrative pages (orders, products, etc.)
components/
  custom/              # shared custom UI elements
  shared/              # shared layout/header/footer
  ui/                  # pages/sections for home, fundraising, blogs, etc.
constant/              # global constants and utilities (e.g., smooth scrolling)
hooks/                 # useUser and similar hooks
public/                # static assets (favicon, icons, images)
store/                 # Zustand stores (cart, orders, wishlist)
styles/                # global styles
```

---

## Data & API Integration
- Primary API endpoint configured by `NEXT_PUBLIC_API_URL`.
- Recommended deployment: reverse proxy the backend under `/api` for same‑origin cookies.
- Products & orders use server‑side pagination for scalability.
- Image URLs served from backend `/uploads` are supported by Next’s Image component via `images.remotePatterns`.

Best practice:
- Keep all network calls in components/stores pointed at `NEXT_PUBLIC_API_URL` or a Next proxy route to ensure portability across environments.

---

## Authentication & Authorization
- Auth is cookie‑based (httpOnly) set by backend.
- `middleware.ts` prevents logged‑in users from visiting guest‑only auth routes (e.g., `/auth/login`) to avoid visual flicker.
- On login/register/reset, frontend hydrates user via `/auth/me` for immediate UI updates.

Security:
- Use HTTPS in production to satisfy `secure` cookies.
- Align cookie domain and CORS with your frontend origin.

---

## Admin Dashboard (Back‑Office)
- Products table: server‑side pagination, search, category filter; CRUD with image upload
- Flavors: displayed and persisted via backend `ProductFlavor` join
- Orders: server‑side pagination with status & payment filters; quick update controls
- UX improvements: zebra rows, sticky headers on large screens, loading skeletons, accessible badges

---

## State Management (Zustand)
- `cartStore.ts`: persistent cart with backend sync (add/update/remove/clear)
- `ordersStore.ts`: list/detail creation and admin status updates
- `wishlistStore.ts`: light‑weight, persistent wishlist
- Stores are modular and test‑friendly; avoid tight coupling with UI

---

## Styling, UX, and Accessibility
- Mobile‑first utility classes; consistent spacing, typography, and color semantics
- Tables and forms optimized for small screens (stacked actions)
- Focus states and ARIA attributes on interactive elements where appropriate

---

## Environment & Configuration
Create `.env.local` (or `.env`):
```env
# Backend origin used by the browser
NEXT_PUBLIC_API_URL=https://api.example.com
# Optional post‑auth redirect
NEXT_PUBLIC_POST_AUTH_REDIRECT_URL=/
```
Notes:
- Use full origin (scheme + host, no trailing slash).
- In development, this can be `http://localhost:4000`.
- In production, this should be `https://api.licorice4good.com`.

---

## Local Development
```bash
npm ci
npm run dev
```
Visit `http://localhost:3000` (development) or `https://licorice4good.com` (production).

---

## Production Build & Deployment
```bash
npm ci
npm run build
npm run start
```
Run behind a reverse proxy with TLS and compression. Ensure `NEXT_PUBLIC_API_URL` is set for build/runtime.

---

## Reverse Proxy & API Proxying
The project supports rewrites to proxy API calls:
- If `NEXT_PUBLIC_API_URL` is missing, rewrites are skipped to prevent build errors.
- When set, `/auth/*`, `/api/products*`, `/cart*`, `/orders*`, and `/uploads/*` are proxied to the backend origin.

Recommendation:
- Prefer same‑origin API (`/api`) to simplify cookie handling and avoid CORS issues.

---

## Images, Assets, and Uploads
- Backend serves images under `/uploads`.
- Next Image `remotePatterns` is configured dynamically from `NEXT_PUBLIC_API_URL` or defaults to `localhost:4000` in development and `api.licorice4good.com` in production.
- Place favicon(s) in `public/` and configure `metadata.icons` in `app/layout.tsx`.

---

## Observability & Error Handling
- Friendly error messages on auth flows
- Recommend adding runtime error boundaries and client‑side error reporting (Sentry/LogRocket)
- Use browser DevTools network tab to verify cookies, CORS, and proxy rewrites in production

---

## Security Best Practices
- Enforce HTTPS; secure cookies; exact `CLIENT_URL` on the API
- Consider HTTP security headers at the reverse proxy (CSP, X‑Frame‑Options)
- Input validation server‑side (Zod on API) is recommended

---

## Performance Optimizations
- Server‑side pagination for admin tables
- Client‑side debouncing for filters
- Lazy image loading and optimized image sizes; CDN for static assets (recommended)

---

## SEO & Marketing
- Add sitemap, robots, canonical tags, and OpenGraph/Twitter metadata
- Optional blog/landing pages to boost organic traffic

---

## Internationalization & Localization (Roadmap)
- i18n scaffolding for multi‑language storefront
- Currency/locale formatting

---

## Affiliate System (Roadmap)
- Affiliate login and dashboards
- Link generator, campaign attribution, and commission reporting
- Exportable statements and payout tracking

---

## Mobile Application (Roadmap)
- React Native application sharing the same auth and API
- Deep linking into product, cart, and orders
- Push notifications for order updates and promotions

---

## Testing Strategy (Roadmap)
- Component unit tests (Jest/RTL)
- API contract tests for critical endpoints
- E2E flows (Playwright) for login, add to cart, and checkout

---

## Troubleshooting & FAQ
- “Destination undefined” on build: ensure `NEXT_PUBLIC_API_URL` is set; rewrites are skipped otherwise
- Auth flicker on auth pages: middleware enforces server‑side redirect; verify cookie name and origin
- Product images not loading: check backend static `/uploads` mapping and Next Image remote patterns

---

## Contributing Guidelines
- Use feature branches and meaningful commit messages
- Keep components small and accessible; colocate tests near code
- Submit PRs with screenshots for UI changes

## License
- Proprietary / All rights reserved (update if open‑sourcing)
