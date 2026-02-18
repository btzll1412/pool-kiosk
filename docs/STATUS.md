# Pool Management System — Development Status

> **IMPORTANT:** This file MUST be updated after every development session. It tracks what has been built, what's in progress, and what's next. Keep it accurate — this is how we pick up where we left off.

---

## Current Phase: Phase 7 Complete — Ready for Phase 8

### Overall Progress

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — Database + Backend API | **Complete** | All models, schemas, services, routers, Alembic, Docker |
| Phase 2 — Admin Panel | **Complete** | Full admin UI with all pages, auth, charts, settings |
| Phase 3 — Kiosk UI | **Complete** | All screens, RFID listener, touch-optimized, inactivity timer |
| Phase 4 — Payment + Cash + PIN | **Complete** | PIN service, cash flow, stub adapter built in Phase 1; kiosk payment screens built in Phase 3 |
| Phase 5 — Recurring Billing + Saved Cards | **Complete** | Auto-charge service, saved card management, APScheduler, kiosk + admin UI |
| Phase 6 — Docker + Nginx | **Complete** | docker-compose.yml, Dockerfiles, nginx.conf done |
| Phase 7 — HA/Notification Hooks | **Complete** | 8 webhook events, scheduled expiry check + daily summary, admin webhook config UI |
| Phase 8 — Real Payment Processor | Not Started | Adapter interface ready |

---

## What Has Been Built

### Infrastructure

- [x] Project repository initialized
- [x] Design document created (`docs/DESIGN.md`)
- [x] Claude instructions file created (`CLAUDE.md`)
- [x] Status tracking file created (`docs/STATUS.md`)
- [x] `.gitignore` configured
- [x] `.env.example` with all env vars documented

### Backend

- [x] Project structure and dependencies (`requirements.txt`)
- [x] Config from environment variables (`app/config.py`)
- [x] Database connection and session management (`app/database.py`)
- [x] FastAPI app with CORS, rate limiting, lifespan (`app/main.py`)
- [x] **13 SQLAlchemy models:** Member, Card, Plan, Membership, Checkin, Transaction, User, Setting, GuestVisit, MembershipFreeze, SavedCard, ActivityLog, PinLockout
- [x] Alembic migration setup (env.py, script template, alembic.ini)
- [x] **Auth system:** JWT access/refresh tokens, password hashing, role-based guards
- [x] **PIN system:** PIN hashing, verification, lockout after max attempts
- [x] **Member service:** CRUD, search, credit adjustments, card management
- [x] **Checkin service:** Membership-aware check-in with swim pass deduction
- [x] **Membership service:** Create, update, swim adjustment, freeze/unfreeze
- [x] **Payment service:** Cash processing (with overpay-to-credit), card (stub), credit balance
- [x] **Report service:** Dashboard stats, revenue by period, swim stats, membership breakdown
- [x] **Settings service:** Default settings, DB-backed overrides
- [x] **Activity logging service:** Before/after snapshots for admin audit trail
- [x] **Notification service:** Full webhook system with 8 event types, per-event URL configuration, fire-and-forget delivery
- [x] **Seed service:** Auto-creates default admin and default settings on startup
- [x] **Rate limiter:** slowapi-based per-IP limiting on kiosk endpoints
- [x] **Payment adapters:** Base interface with tokenize/charge_saved_card methods, Stub adapter (always succeeds), Cash adapter (rejects card ops)
- [x] **Auto-charge service** (`services/auto_charge_service.py`): process_due_charges (daily scheduler), enable/disable auto-charge, on-demand saved card charging
- [x] **APScheduler** integrated in app lifespan — 3 daily jobs: auto-charge (06:00), membership expiry check (07:00), daily summary (21:00)
- [x] **10 Pydantic schema modules:** auth, member, card, plan, membership, checkin, transaction, kiosk, settings, report
- [x] **11 API routers:** auth, members, cards, plans, memberships, checkins, payments, transactions, reports, settings, kiosk
- [x] All kiosk endpoints: scan, search, checkin, plans, pay/cash, pay/card (with saved card support + save-after-payment), pay/split, freeze, unfreeze, saved-cards CRUD, tokenize, set-default, auto-charge enable/disable, guest visit, change notification
- [x] All admin endpoints: full CRUD for members/plans/memberships, transaction management, reports with CSV export, settings management, member saved cards view + delete
- [x] Activity logging on all admin mutations
- [x] **Webhook events** fired from: kiosk checkin, credit payment (low balance), auto-charge success/failure
- [x] **Webhook test endpoint** `POST /api/settings/webhook-test?event_type=<type>` for admin testing
- [x] **Membership expiry check** scheduled job fires `membership_expiring` and `membership_expired` webhooks
- [x] **Daily summary** scheduled job fires stats webhook at 21:00

### Frontend — Admin Panel

- [x] React + Vite + Tailwind CSS project setup
- [x] Inter font, custom brand color palette, @tailwindcss/forms plugin
- [x] **API client layer** with Axios, JWT interceptor, auto-refresh, 8 API modules (auth, members, plans, checkins, payments, reports, settings, auth)
- [x] **Auth context** with login/logout state management
- [x] **useApi hook** for data fetching with loading/error states
- [x] **11 shared components:** Button (4 variants, 4 sizes, loading state), Modal (keyboard dismiss, backdrop blur), Table (pagination, loading, empty state), Badge (6 colors), Card + CardHeader, Input (with error/help text), Select, StatCard (5 color themes), EmptyState, PageHeader, ConfirmDialog
- [x] **Admin layout:** Sidebar with icon navigation (desktop fixed + mobile overlay), Header with user menu + logout, responsive design with mobile hamburger menu
- [x] **Login page:** Gradient background, branded card, form validation, JWT token storage, auto-redirect
- [x] **Dashboard:** 5 stat cards (check-ins, swimmers, revenue, memberships, guests), quick action links, system status panel
- [x] **Members list:** Search by name/phone/email, paginated table with avatar initials, status badges, click-to-detail
- [x] **Member detail:** Info card, RFID cards list with deactivate, saved payment cards section with auto-charge status and admin delete, activity log timeline, credit adjustment modal, deactivate confirmation dialog, edit/back navigation
- [x] **Member form:** Create + edit mode, all fields, PIN on create, textarea for notes, validation
- [x] **Plans list:** Card grid layout with type badges, pricing display, inline edit/deactivate, modal form for create/edit with plan-type-aware fields
- [x] **Transactions list:** Filterable by type/method/date range, paginated table, color-coded badges, CSV export button, clear filters
- [x] **Revenue report:** Date range + grouping selectors, stacked bar chart (Recharts) for cash/card/credit breakdown, stat cards, membership breakdown with progress bars
- [x] **Swim report:** Date range selector, stat cards, donut pie chart for check-in types
- [x] **Settings page:** 6 grouped sections (Kiosk, Timer, PIN, Fees, Features, Notifications & Webhooks), toggle switches, webhook URL fields with inline "Test" buttons, sticky save bar with unsaved changes indicator
- [x] **App routing:** Protected routes, nested admin layout, all page routes wired

### Frontend — Kiosk UI

- [x] **Kiosk API client** (`api/kiosk.js`) — 19 endpoint functions: scan, search, checkin, getPlans, payCash, payCard (with save options), paySplit, notifyChange, freeze, unfreeze, guestVisit, getSettings, getSavedCards, tokenizeAndSaveCard, updateSavedCard, deleteSavedCard, setDefaultCard, enableAutoCharge, disableAutoCharge
- [x] **KioskApp** (`kiosk/KioskApp.jsx`) — State-machine screen manager with RFID listener, inactivity timer, settings loading, and screen transitions
- [x] **7 kiosk components:**
  - RFIDListener — Captures USB HID keyboard input from RFID reader, 200ms buffer timeout, Enter key triggers scan
  - NumPad — Touch-friendly number pad with optional decimal point, backspace, clear
  - MemberCard — Member info display with name, status indicator, plan details, credit balance, frozen state
  - PlanCard — Plan option card with type icon, price, swim count / duration, selected state
  - InactivityTimer — Global inactivity detection with configurable timeout, "Still Here?" overlay with countdown progress bar
  - KioskButton — Large touch-target button with 5 variants, 3 sizes, loading state, active scale animation
  - AutoReturnBar — Countdown progress bar for auto-return to idle after actions
- [x] **16 kiosk screens:**
  - IdleScreen — Welcome screen with pool name, RFID scan prompt, "Search Account" and "Guest Visit" buttons
  - MemberScreen — Member info card, Check In button (active plan), purchase prompt (no plan), unfreeze option (frozen), manage account
  - CheckinScreen — Guest count selector (+/- buttons, max from settings), success state with auto-return
  - SearchScreen — Name/phone search input, results list with member cards, tap-to-select
  - PinScreen — 4-digit PIN entry with numpad, dot indicators, routes to afterPin destination, handles unfreeze directly
  - PaymentScreen — Plan grid selection, payment method chooser (Cash / Card / Split)
  - CashScreen — Amount numpad with decimal, price display, overpay-to-credit messaging, change detection
  - CardPaymentScreen — Card payment with saved card selector, default card highlight, new card option with save toggle
  - ChangeScreen — "Someone will bring your change" notification with amount display, auto-return
  - StatusScreen — Configurable success/error/info display with icon, title, message, auto-return
  - GuestScreen — Two-step flow: name + phone entry, then plan selection + pay method
  - ManageAccountScreen — Account overview with membership status, manage saved cards, purchase/top-up, freeze membership
  - FreezeScreen — Days-to-freeze numpad entry, PIN-verified freeze action
  - SavedCardsScreen — List all saved cards with rename/delete/set-default/auto-charge actions, add new card button
  - AddCardScreen — Simulates card read (stub mode), card brand selection, friendly name entry, tokenize + save
  - AutoChargeScreen — Card info display, monthly plan selection grid, enable/disable auto-charge with next charge date
- [x] **Route wiring:** `/kiosk` route added to App.jsx, default redirect changed to `/kiosk`

### DevOps

- [x] Docker Compose configuration (postgres, backend, frontend, nginx)
- [x] Backend Dockerfile (with auto-migration on startup)
- [x] Frontend Dockerfile (multi-stage build)
- [x] Nginx reverse proxy configuration
- [x] Environment variable setup (`.env.example`)

---

## Known Issues

_None yet._

---

## Decisions & Deviations from Original Design

- Added `pin_hash` field directly on the `Member` model (not a separate table) for simplicity
- Added `friendly_name` field on `SavedCard` model for card naming feature
- Payment split endpoint uses a simplified flow (processes as single cash transaction when cash covers full amount)
- The `credit` model from the design was not created as a separate model — credit is tracked as `credit_balance` on `Member` and as `Transaction` records
- Admin panel uses Recharts for charts (bar charts for revenue, pie charts for swim types)
- Settings page uses toggle switches for boolean settings and a sticky bottom save bar
- Toast notifications use react-hot-toast with custom branded styles
- Kiosk UI uses a state-machine pattern (not React Router) for screen management — simpler for the kiosk use case where screens transition based on actions rather than URLs
- Default route (`/`) redirects to `/kiosk` (the kiosk is the primary interface), admin accessed at `/admin`
- KioskApp manages its own Toaster instance positioned at top-center (vs admin's top-right)
- Kiosk settings loaded from `/api/settings` endpoint on KioskApp mount (reuses admin settings endpoint without auth)
- Auto-charge uses APScheduler (BackgroundScheduler) instead of Celery — appropriate for single-server kiosk deployment, no Redis needed
- Auto-charge limited to monthly plans only — single swims and swim passes don't have fixed renewal cycles
- Only one card per member can have auto-charge enabled (enabling on one card disables any other)
- Stub adapter generates fake tokens and always succeeds for charge_saved_card — real processor integration deferred to Phase 8

---

## Last Updated: 2026-02-18 (Phase 7)
