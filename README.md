# ShikkuLens POS — Frontend

Next.js (App Router) + TypeScript + Tailwind frontend for the ShikkuLens contact-lens shop POS/backoffice system. Talks to the API in `backoffice-backend-shikku`.

## Setup

```bash
npm install
```

`.env.local` already points at the local backend:

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

## Run

Start the backend first (see its README), then:

```bash
npm run dev
```

Open http://localhost:3000 — it redirects to `/dashboard`, which redirects to `/login` until you sign in. Use one of the seeded accounts (see the backend README / seed script output), e.g.:

- `admin@shikkulens.local` / `adminPass123!`

## Structure

- `src/app/(dashboard)/*` — every authenticated screen (POS, products, stock, transfers, purchases, suppliers, customers, promotions, shifts, refunds, expenses, reports, audit logs, settings, online orders), each a route under the shared dashboard shell in `layout.tsx`.
- `src/app/login` — public login page.
- `src/lib/apiClient.ts` — fetch wrapper with automatic access-token refresh.
- `src/lib/authStore.ts` — Zustand store for the session (persisted to localStorage) and the selected branch.
- `src/components/RoleGate.tsx` — hides UI by role; **the backend is the real enforcement point**, this is just UI convenience.

## Build

```bash
npm run build
```

## Notes

- The backend is the source of truth for every permission and business rule (branch scoping, cost visibility, report history limits, etc.) — nothing here should be trusted as the sole guard for sensitive data.
- PWA/offline support is intentionally minimal for Phase 1 (per the requirement doc's B12 decision: online/offline awareness only, no offline sale queue).
