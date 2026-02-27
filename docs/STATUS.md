# Pool Management System — Development Status

> **IMPORTANT:** This file MUST be updated after every development session. It tracks what has been built, what's in progress, and what's next. Keep it accurate — this is how we pick up where we left off.

---

## Current Phase: Phase 11 — Pool Scheduling

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
| Phase 8 — Payment Processors, Email, SIP & UI Polish | **Complete** | Stripe/Square/Sola adapters, SMTP email, SIP/FusionPBX, dark mode, kiosk transitions, skeletons |
| Phase 9 — UX Polish & Admin Enhancements | **Complete** | Kiosk UX improvements, swim pass stacking, signup, backup/restore, membership management |
| Phase 10 — Senior Discounts & Monthly Billing | **Complete** | Senior citizen discounts, DOB tracking, monthly pro-rated billing, permanent member delete |
| Phase 11 — Pool Scheduling | **Complete** | Weekly schedules, men's/women's hours, schedule overrides, gender-based check-in validation |

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
- [x] **15 SQLAlchemy models:** Member, Card, Plan, Membership, Checkin, Transaction, User, Setting, GuestVisit, MembershipFreeze, SavedCard, ActivityLog, PinLockout, PoolSchedule, ScheduleOverride
- [x] Alembic migration setup (env.py, script template, alembic.ini)
- [x] **Auth system:** JWT access/refresh tokens, password hashing, role-based guards
- [x] **PIN system:** PIN hashing, verification, lockout after max attempts
- [x] **Member service:** CRUD, search, credit adjustments, card management
- [x] **Checkin service:** Membership-aware check-in with swim pass deduction
- [x] **Membership service:** Create, update, swim adjustment, freeze/unfreeze
- [x] **Payment service:** Cash processing (with overpay-to-credit or change-due), card (stub), credit balance, split payment (cash + card)
- [x] **Report service:** Dashboard stats, revenue by period, swim stats, membership breakdown
- [x] **Settings service:** Default settings, DB-backed overrides
- [x] **Activity logging service:** Before/after snapshots for admin audit trail
- [x] **Notification service:** Full webhook system with 8 event types, per-event URL configuration, fire-and-forget delivery
- [x] **Seed service:** Auto-creates default admin and default settings on startup
- [x] **Rate limiter:** slowapi-based per-IP limiting on kiosk endpoints
- [x] **Payment adapters:** Base interface with tokenize/charge_saved_card/test_connection methods, Stub adapter (always succeeds), Cash adapter (rejects card ops), Stripe adapter (PaymentIntent + Customer API), Square adapter (Payments + Customers API), Sola adapter (REST/httpx), USAePay adapter (REST API v2/httpx)
- [x] **Auto-charge service** (`services/auto_charge_service.py`): process_due_charges (daily scheduler), enable/disable auto-charge, on-demand saved card charging, email receipt on success
- [x] **APScheduler** integrated in app lifespan — 3 daily jobs: auto-charge (06:00), membership expiry check (07:00), daily summary (21:00)
- [x] **Email service** (`services/email_service.py`): SMTP-based send_email(), test_email_connection(), send_auto_charge_receipt(), send_membership_expiring_email(), send_membership_expired_email()
- [x] **SIP service** (`services/sip_service.py`): FusionPBX REST API integration, originate_call(), call_for_change_needed(), test_sip_connection()
- [x] **Sensitive settings masking** — GET endpoint returns masked values (••••••) for API keys and passwords; PUT filters out masked values to prevent overwriting secrets
- [x] **10 Pydantic schema modules:** auth, member, card, plan, membership, checkin, transaction, kiosk, settings, report
- [x] **12 API routers:** auth, members, cards, plans, memberships, checkins, payments, transactions, reports, settings, kiosk, schedules
- [x] All kiosk endpoints: scan, search, checkin, plans, pay/cash, pay/card (with saved card support + save-after-payment), pay/split, freeze, unfreeze, saved-cards CRUD, tokenize, set-default, auto-charge enable/disable, guest visit, change notification, verify-pin, signup
- [x] All admin endpoints: full CRUD for members/plans/memberships, transaction management, reports with CSV export, settings management, member saved cards view + delete, member memberships view + manage, full system backup/export, system restore/import, member PIN unlock, members CSV import/export
- [x] Activity logging on all admin mutations
- [x] **Webhook events** fired from: kiosk checkin, credit payment (low balance), auto-charge success/failure
- [x] **Webhook test endpoint** `POST /api/settings/webhook-test?event_type=<type>` for admin testing
- [x] **Payment test endpoint** `POST /api/settings/payment-test?processor=<type>` for admin testing
- [x] **Email test endpoint** `POST /api/settings/email-test` for admin testing
- [x] **SIP test endpoint** `POST /api/settings/sip-test` for admin testing
- [x] **Membership expiry check** scheduled job fires `membership_expiring` and `membership_expired` webhooks + sends expiry emails
- [x] **Daily summary** scheduled job fires stats webhook at 21:00
- [x] **Test suite** — 38 pytest tests covering auth, kiosk scan/search/checkin, cash/card/split payments, PIN verification + lockout
- [x] **Consistent logging** — Every service, router, and payment adapter uses `logging.getLogger(__name__)` with structured key=value messages
- [x] **Global log format** configured in main.py: `%(asctime)s [%(levelname)s] %(name)s: %(message)s`

### Frontend — Admin Panel

- [x] React + Vite + Tailwind CSS project setup
- [x] Inter font, custom brand color palette, @tailwindcss/forms plugin
- [x] **API client layer** with Axios, JWT interceptor, auto-refresh, 8 API modules (auth, members, plans, checkins, payments, reports, settings, auth) — settings API includes testPaymentConnection, testEmail, testSipCall
- [x] **Auth context** with login/logout state management
- [x] **useApi hook** for data fetching with loading/error states
- [x] **12 shared components:** Button (4 variants, 4 sizes, loading state), Modal (keyboard dismiss, backdrop blur), Table (pagination, loading, empty state), Badge (6 colors), Card + CardHeader, Input (with error/help text), Select, StatCard (5 color themes), EmptyState, PageHeader, ConfirmDialog, Skeleton (SkeletonLine, SkeletonCard, SkeletonStatCards, SkeletonTable) — all with dark mode support
- [x] **Admin layout:** Sidebar with icon navigation (desktop fixed + mobile overlay), Header with user menu + logout, responsive design with mobile hamburger menu
- [x] **Login page:** Gradient background, branded card, form validation, JWT token storage, auto-redirect
- [x] **Dashboard:** 5 stat cards (check-ins, swimmers, revenue, memberships, guests), quick action links, system status panel
- [x] **Members list:** Search by name/phone/email, paginated table with avatar initials, status badges, click-to-detail
- [x] **Member detail:** Info card, RFID cards list with deactivate, saved payment cards section with auto-charge status and admin delete/add, memberships section with swim progress bars and management (add with payment/adjust/deactivate), activity log timeline, credit adjustment modal, deactivate confirmation dialog, edit/back navigation
- [x] **Member form:** Create + edit mode, all fields, PIN on create, textarea for notes, validation
- [x] **Plans list:** Card grid layout with type badges, pricing display, inline edit/deactivate, modal form for create/edit with plan-type-aware fields
- [x] **Transactions list:** Filterable by type/method/date range, paginated table, color-coded badges, CSV export button, clear filters
- [x] **Revenue report:** Date range + grouping selectors, stacked bar chart (Recharts) for cash/card/credit breakdown, stat cards, membership breakdown with progress bars
- [x] **Swim report:** Date range selector, stat cards, donut pie chart for check-in types
- [x] **Settings page:** 4 category tabs (General, Payments, Notifications, Backup), 13 grouped sections (Kiosk, Timer, PIN, Fees, Features, Notifications & Webhooks, Payment Processor, Stripe/Square/Sola Configuration, Email SMTP, SIP/Phone System), toggle switches, webhook URL fields with inline "Test" buttons, password fields with show/hide toggle, conditional group rendering (processor-specific), Test Connection buttons, sticky save bar with unsaved changes indicator
- [x] **Backup & Restore:** Full system export to JSON (all tables), import from JSON with confirmation modal, includes members, plans, memberships, transactions, settings, cards, checkins, saved cards, guest visits, activity logs
- [x] **Guest visits page:** Paginated list of walk-in guest visits with name, phone, payment details
- [x] **Plans list:** Active subscriber count displayed on each plan card
- [x] **App routing:** Protected routes, nested admin layout, all page routes wired

### Frontend — Kiosk UI

- [x] **Kiosk API client** (`api/kiosk.js`) — 21 endpoint functions: scan, search, checkin, getPlans, payCash, payCard (with save options), paySplit, notifyChange, freeze, unfreeze, guestVisit, getSettings, getSavedCards, tokenizeAndSaveCard, updateSavedCard, deleteSavedCard, setDefaultCard, enableAutoCharge, disableAutoCharge, verifyPin, signup
- [x] **KioskApp** (`kiosk/KioskApp.jsx`) — State-machine screen manager with RFID listener, inactivity timer, settings loading, and screen transitions (fade crossfade via ScreenTransition component)
- [x] **7 kiosk components:**
  - RFIDListener — Captures USB HID keyboard input from RFID reader, 200ms buffer timeout, Enter key triggers scan
  - NumPad — Touch-friendly number pad with optional decimal point, backspace, clear
  - MemberCard — Member info display with name, status indicator, plan details, credit balance, frozen state
  - PlanCard — Plan option card with type icon, price, swim count / duration, selected state
  - InactivityTimer — Global inactivity detection with configurable timeout, "Still Here?" overlay with countdown progress bar
  - KioskButton — Large touch-target button with 5 variants, 3 sizes, loading state, active scale animation
  - AutoReturnBar — Countdown progress bar for auto-return to idle after actions
- [x] **18 kiosk screens:**
  - IdleScreen — Welcome screen with pool name, RFID scan prompt, "Search Account", "Guest Visit", and "New Member" buttons
  - MemberScreen — Member info card, Check In button (active plan), purchase prompt (no plan), unfreeze option (frozen), manage account
  - CheckinScreen — Success view with auto-return, simplified flow (guest count removed from this screen)
  - SignUpScreen — New member self-registration with first name, last name, phone, email, and 4-digit PIN
  - SearchScreen — Name/phone search input with 300ms debounce, results list with member cards, tap-to-select
  - PinScreen — 4-digit PIN entry with numpad, dot indicators, API-verified PIN before navigation, handles unfreeze directly
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
  - SplitPaymentScreen — Cash amount numpad + saved card selector, live cash/card split display, submits to split payment endpoint
- [x] **Route wiring:** `/kiosk` route added to App.jsx, default redirect changed to `/kiosk`
- [x] **Consistent error handling** — All API calls use `.catch()` with `err.response?.data?.detail` extraction, no silent failures

### Frontend — UI Polish (Phase 8)

- [x] **Dark mode** — Tailwind `darkMode: "class"`, ThemeContext with localStorage persistence, Sun/Moon toggle in admin Header
- [x] **All shared components** have `dark:` variant classes (backgrounds, borders, text, rings)
- [x] **All admin pages** have `dark:` variant classes (Dashboard, Members, Plans, Transactions, Reports, Settings, Login)
- [x] **Admin layout** (Sidebar, Header, Layout) have `dark:` variant classes
- [x] **Kiosk screen transitions** — ScreenTransition component with 150ms fade crossfade on screen changes
- [x] **CSS keyframe animations** — animate-fade-in, animate-slide-up, animate-scale-in, animate-checkmark-pop, skeleton-pulse
- [x] **Micro-animations** — PlanCard scale-on-select (scale-[1.03]), CheckinScreen checkmark pop, NumPad button bounce (active:scale-90)
- [x] **Loading skeletons** — Replaced spinners with skeleton placeholders in Dashboard, PlansList, Settings, RevenueReport, SwimReport, MemberDetail, MemberForm

### DevOps

- [x] Docker Compose configuration (postgres, backend, frontend, nginx)
- [x] Backend Dockerfile (with auto-migration on startup)
- [x] Frontend Dockerfile (multi-stage build)
- [x] Nginx reverse proxy configuration
- [x] Environment variable setup (`.env.example`)

---

## Known Issues

_None._

---

## Phase 8 Implementation Notes (2026-02-18)

### Payment Processor Backend
- `get_payment_adapter()` now accepts `db: Session` parameter — reads `payment_processor` setting from DB instead of env var
- Processor config (API keys, secrets) read from DB settings via `get_processor_config()` helper
- Three new adapters: Stripe (PaymentIntent/Customer API), Square (squareup SDK, location-scoped), Sola (httpx REST)
- All adapters implement `test_connection()` for admin verification
- `payment_adapter` removed from `config.py` — DB settings is sole source of truth
- Sensitive settings (API keys, passwords) masked with "••••••" on GET; PUT filters out masked values

### Email Service
- SMTP-based using `smtplib` — reads config from DB settings
- Wired to: membership expiry check (expiring + expired emails), auto-charge success (receipt)
- TLS support via `email_tls_enabled` setting

### SIP / Phone Integration
- FusionPBX REST API for outbound call origination
- Wired to `send_change_notification()` — triggers SIP call to staff when change is needed
- Configurable via `sip_*` settings in admin

### Admin Settings UI
- 13 setting groups with conditional rendering (processor-specific groups shown/hidden based on `payment_processor` value)
- Password field type with show/hide eye toggle
- Test Connection buttons for payment processor, email, and SIP

### UI Polish
- Dark mode with Tailwind `darkMode: "class"` and ThemeContext (persists to localStorage)
- Kiosk screen transitions (150ms fade crossfade)
- Skeleton loading states replacing full-page spinners
- Micro-animations on interactive kiosk elements

---

## Bug Fixes (2026-02-18)

1. **Split payment was broken** — PaymentScreen "Split Payment" button navigated to CashScreen instead of a split flow; backend calculated card remainder but never charged it. Fixed by creating SplitPaymentScreen and rewriting the backend to process both cash and card transactions.
2. **`change_due` always returned 0** — Cash overpayment was silently added to credit with no option for physical change. Added `wants_change` flag to cash payment; CashScreen now shows two options when overpaying: "Add to Credit" or "I Need Change" (which triggers staff notification).
3. **`JSONB` → `JSON` in ActivityLog** — Switched from PostgreSQL-specific `JSONB` to generic `JSON` for cross-database test compatibility. No functional difference (column only stores audit snapshots, never queried).
4. **bcrypt 5.0 incompatible with passlib 1.7.4** — Pinned `bcrypt==4.0.1` in requirements.txt to fix password hashing errors.

---

## Decisions & Deviations from Original Design

- Added `pin_hash` field directly on the `Member` model (not a separate table) for simplicity
- Added `friendly_name` field on `SavedCard` model for card naming feature
- Split payment creates two separate transactions (cash + card) and a single membership; if cash covers the full amount, falls back to regular cash payment
- Cash payment supports `wants_change` flag: when false, overpayment goes to credit; when true, overpayment returned as `change_due` and staff is notified
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
- Swim pass stacking — purchasing a new swim pass adds swims to existing active swim pass instead of creating duplicate membership
- Only one card per member can have auto-charge enabled (enabling on one card disables any other)
- Stub adapter generates fake tokens and always succeeds for charge_saved_card — useful for testing without real processor
- Payment processor config stored in DB settings (not env vars) — allows switching processors from admin UI without restart
- Sensitive settings masked with "••••••" on GET; PUT filters out masked values to prevent overwriting secrets
- Email uses smtplib directly — simpler than async alternatives for scheduler context
- SIP integration uses FusionPBX REST API, not raw SIP protocol
- Dark mode uses Tailwind `darkMode: "class"` with React Context persisted to localStorage
- Kiosk screen transitions use opacity-based crossfade (150ms)
- Loading skeletons replace spinners for better perceived performance

---

## Logging & Error Handling (2026-02-18)

### Backend Logging Added

All 10 services, 11 routers, and 2 payment adapters now use consistent structured logging:

- **payment_service.py** — Cash/card/credit payment lifecycle, overpayment handling, low balance alerts
- **checkin_service.py** — Check-in success/failure, swim pass deduction, membership validation
- **membership_service.py** — Create, update, swim adjust, freeze/unfreeze
- **member_service.py** — Create, update, deactivate, credit adjust, card assign/deactivate
- **pin_service.py** — PIN verification, failed attempts, account lockouts (security audit trail)
- **auth_service.py** — Token decode failures, user not found, admin access denied
- **activity_service.py** — Debug-level activity log entries
- **settings_service.py** — Settings update with key count
- **seed.py** — Admin creation and settings seeding
- **All routers** — Request-level logging for key operations (login, kiosk actions, settings, reports)
- **Payment adapters** — Stub payment initiation/tokenization, cash adapter unsupported operation warnings

### Frontend Error Handling Fixed

- **Dashboard, MembersList, MemberForm, RevenueReport, SwimReport** — Added missing `.catch()` on data load
- **MemberDetail** — Fixed 3 empty catch blocks + added `.catch()` to initial data load
- **Settings** — Added `.catch()` to settings load, fixed save/test webhook catch blocks
- **Login** — Fixed catch block to extract server error detail
- **SavedCardsScreen** — Fixed 3 empty catch blocks with specific error messages
- **SplitPaymentScreen** — Added `console.warn` for background card loading failure
- **API client** — Added `console.warn` for token refresh failures

---

---

## Phase 9 Implementation Notes (2026-02-19)

### Kiosk UX Improvements
- **PIN verification** now calls API before navigation — invalid PINs rejected immediately with toast error
- **Search debounce** — 300ms delay on search input to reduce API calls while typing
- **Check-in simplified** — CheckinScreen now shows success view only, guest count handled elsewhere
- **Inactivity timer** — Added `key={screen}` prop to reset timer on every screen change
- **Guest screen** — Phone field now required for walk-in guests

### Swim Pass Stacking
- When purchasing a new swim pass, system checks for existing active swim_pass membership
- If found, adds new swims to existing pass instead of creating duplicate membership
- Prevents members from having multiple overlapping swim passes

### Kiosk Self-Registration (SignUpScreen)
- New members can register themselves at kiosk without admin
- Fields: first name, last name, phone (required), email (optional), 4-digit PIN
- Creates member record and returns member status for immediate check-in

### Manual Card Entry
- CardPaymentScreen now supports manual entry when no card reader available
- User enters last 4 digits and selects card brand from dropdown
- Useful for testing and environments without physical card readers

### Admin Panel Enhancements
- **Settings tabs** — Organized into 4 categories: General, Payments, Notifications, Backup
- **Backup/Restore** — Full system export/import for server migration or data backup
- **Guest visits page** — View all walk-in guest visits with pagination
- **Plan subscriber counts** — Each plan card shows number of active subscribers
- **Member memberships** — View and manage member's plans with swim adjustment and deactivation

### Member History
- Now includes both ActivityLog entries AND Checkin records
- Merged and sorted by date for complete member timeline

### Admin PIN Unlock
- Added `unlock_member_pin` and `get_pin_lockout_status` functions to pin_service
- PIN lockout status shown in member detail when account is locked
- Admin can click "Unlock" button to clear failed attempts and unlock account

### Members CSV Import/Export
- Export all members to CSV with name, phone, email, credit balance, status
- Import members from CSV with validation for duplicates
- Import reports errors and skipped rows

### Admin Check-ins Page
- New Check-ins page added to admin sidebar with ClipboardCheck icon
- Filterable by: search (member name), check-in type, date range (start/end), unique members only
- Quick date filter buttons: Today, This Week, This Month
- Displays: member name with initials avatar, type badge, guest count, date/time, notes
- Shows total check-ins and unique member count
- CSV export of filtered results
- Clicking a row navigates to member detail page
- Backend filtering supports all filter combinations with proper date range handling

### Admin PIN Reset
- Admin can reset/modify member PINs from member detail page
- PIN must be 4-6 digits
- Logs action in activity log
- Automatically unlocks PIN if account was locked

### Kiosk Settings Auto-Refresh
- Settings refresh every 30 seconds when on idle screen
- Allows admin changes to take effect without manual kiosk refresh
- Stops polling when navigating away from idle screen

### Account Credit Payment
- Members can use account credit towards plan purchases
- Payment screen shows "Account Credit" option with Wallet icon
- Full credit payment when balance covers entire amount
- Partial credit with CreditPartialScreen when credit doesn't cover full amount
- Cash or card can be used for remaining balance after credit applied

### Inactivity Timer Fixes
- Fixed stale closure issue causing timer to not work on input screens
- Uses refs to track warning state without dependencies
- Removed mousemove event to prevent constant timer resets
- Dialog dismissible by clicking anywhere on screen

---

---

## Phase 10 Implementation Notes (2026-02-22)

### Senior Citizen Discount System
- Added `date_of_birth` (DATE, nullable) and `is_senior` (BOOLEAN, default false) fields to Member model
- Added `senior_age_threshold` setting (default: 65) to configure senior eligibility age
- SignUpScreen and EditProfileScreen allow members to enter DOB
- When DOB qualifies for senior discount, checkbox auto-selects
- Admin MemberForm also supports DOB and senior flag editing

### Senior Plans
- Added `is_senior_plan` (BOOLEAN, default false) field to Plan model
- Admin plan form includes "Senior Citizen Discount Plan" checkbox
- Senior badge shows on plan cards in admin list
- Kiosk filters plans by member's senior status — senior members see senior plans

### Monthly Billing Overhaul
- Changed monthly plans from `duration_days` to `duration_months`
- Added `duration_months` (INTEGER, nullable) field to Plan model
- Added `next_billing_date` (DATE, nullable) field to Membership model
- Pro-rated billing: first month charges only remaining days at daily rate
- Plans endpoint returns `prorated` object with `prorated_price`, `days_remaining`, `days_in_month`, `full_price`
- Plan cards show regular price large, "Pay today: $X.XX" in green below
- Payment screen shows "amount due today" for monthly plans

### Member Management
- Added permanent delete option for deactivated members (removes all related data)
- "Manage Account" renamed to "Manage My Account" in kiosk
- Members can edit DOB from kiosk Edit Profile screen

### Check-in Fixes
- Single swim plan type now works for check-in (was only handling monthly and swim_pass)
- Single swim membership marked inactive after use

### Signup Flow Improvements
- Card validation during signup checks if card is already assigned
- Button changed from "Continue to Plans" to "Create Account"
- Success toast "Account created successfully!" shown before redirect to plans
- Search screen only searches after 3+ characters typed

### Database Migrations Added
- `b2c3d4e5f6g7_add_senior_fields.py` — date_of_birth, is_senior on members
- `c3d4e5f6g7h8_add_senior_plan_field.py` — is_senior_plan on plans
- `d4e5f6g7h8i9_add_monthly_billing_fields.py` — duration_months on plans, next_billing_date on memberships

---

---

## Admin Payment Flow Enhancement (2026-02-24)

### Admin Payment Collection on Membership Add
- Admins can now optionally collect payment when adding a membership to a member
- `POST /memberships` endpoint extended with optional `payment` field
- Payment options:
  - **Cash payment** — Records transaction with amount tendered
  - **Saved card** — Charges existing saved card via `charge_saved_card_now()`
  - **New card** — Optionally tokenizes and saves card for future use
  - **Autopay** — Can enable auto-charge for monthly plans when saving new card
- Response includes `transaction_id`, `saved_card_id`, and status `message`

### Admin Add Card on File
- New `POST /members/{member_id}/saved-cards` endpoint for admin to add payment cards
- No PIN required (admin action)
- Accepts: card_last4, card_brand, friendly_name (optional)
- Tokenizes card via payment adapter and creates SavedCard record

### Frontend Updates
- Add Membership modal expanded with payment collection options:
  - "Collect payment now" checkbox
  - Payment method selection (Cash/Card)
  - Cash amount input
  - Saved card selection or new card entry
  - Save card checkbox
  - Enable autopay checkbox (monthly plans only)
- "Add Card" button added to Saved Cards section in member detail
- New "Add Payment Card" modal for standalone card management

### Files Modified
- `backend/app/schemas/membership.py` — Added PaymentInfo, MembershipCreateWithPaymentResponse, SavedCardCreate, SavedCardResponse
- `backend/app/routers/memberships.py` — Extended POST /memberships with payment processing
- `backend/app/routers/members.py` — Added POST /members/{member_id}/saved-cards
- `frontend/src/api/members.js` — Added addMemberSavedCard()
- `frontend/src/admin/pages/Members/MemberDetail.jsx` — Added payment flow and add card UI

---

## Pool Scheduling System (2026-02-24)

### Weekly Schedule Management
- New `pool_schedules` table for recurring weekly time blocks
- Schedule types: Open Swim, Men Only, Women Only, Lap Swim, Lessons, Maintenance, Closed
- Each block has: name, type, day_of_week (0-6), start_time, end_time, priority, notes, is_active
- Higher priority blocks override lower priority when times overlap
- Full CRUD API at `GET/POST/PUT/DELETE /api/schedules`
- `GET /api/schedules/weekly` returns full week organized by day
- `GET /api/schedules/current` returns current pool status with restrictions

### Schedule Overrides
- New `schedule_overrides` table for temporary date/time-based overrides
- Overrides take precedence over regular weekly schedule when active
- Fields: name, type, start_datetime, end_datetime, is_active, notes, created_by
- Use cases: holidays, private events, special hours
- Full CRUD API at `GET/POST/PUT/DELETE /api/schedules/overrides`

### Gender-Based Check-in Validation
- Added `gender` field to Member model (male/female/null)
- During men_only or women_only hours, kiosk validates member gender before check-in
- Friendly error messages: "Sorry, this is currently Men's/Women's Hours. Please come back during..."
- Gender can be set in admin MemberForm and kiosk signup/profile

### Admin UI
- New "Schedules" page with sidebar navigation (Calendar icon)
- Tab interface: Weekly Schedule | Special Overrides
- Weekly view shows 7-day grid with color-coded time blocks per type
- Legend displays all schedule type colors
- Active override warning banner when override is in effect
- Create/Edit/Delete modals for schedules and overrides
- Bulk clear all schedules option

### Database Changes
- Migration `e5f6g7h8i9j0_add_schedules_and_gender.py`:
  - Creates `scheduletype` enum
  - Creates `pool_schedules` table
  - Creates `schedule_overrides` table
  - Adds `gender` column to `members` table

### Files Added
- `backend/app/models/pool_schedule.py` — PoolSchedule, ScheduleOverride, ScheduleType
- `backend/app/schemas/pool_schedule.py` — Create/Update/Response schemas
- `backend/app/routers/schedules.py` — Full CRUD + current/weekly endpoints
- `frontend/src/api/schedules.js` — API functions
- `frontend/src/admin/pages/Schedules/ScheduleManager.jsx` — Admin UI

### Files Modified
- `backend/app/main.py` — Added schedules router
- `backend/app/models/__init__.py` — Export new models
- `backend/app/routers/kiosk.py` — Gender-based check-in validation
- `backend/app/schemas/kiosk.py` — Added gender to MemberStatus, signup, profile update
- `backend/app/schemas/member.py` — Added gender to schemas
- `backend/app/services/member_service.py` — Added gender to create_member
- `frontend/src/App.jsx` — Added schedules route
- `frontend/src/admin/layout/Sidebar.jsx` — Added Schedules nav item
- `frontend/src/admin/pages/Members/MemberForm.jsx` — Added gender dropdown

---

---

## USAePay Integration (2026-02-25)

### USAePay Payment Adapter
- Added `usaepay_adapter.py` implementing `BasePaymentAdapter`
- Uses USAePay REST API v2 with Basic auth (API key + seed + SHA256 hash)
- Supports sandbox and production environments
- Endpoints: `/api/v2/transactions` for sales, refunds, tokenization

### Implementation Details
- Authentication: Generates seed, creates SHA256 hash of `apikey+seed+pin`, Base64 encodes auth header
- Sales: `command: "sale"` with amount and creditcard
- Tokenization: Uses `save_card: true` on sales, returns token for future use
- Saved card charges: Token goes in `creditcard.number` field
- Refunds: `command: "refund"` with `trankey` from original transaction
- Test connection: Validates credentials by checking API response

### Settings Added
- `usaepay_api_key` — API key (masked in UI)
- `usaepay_api_pin` — API PIN (masked in UI)
- `usaepay_environment` — sandbox or production

### Frontend
- Added "USAePay" option to payment processor dropdown
- Added USAePay Configuration section with API Key, PIN, and Environment fields
- Test Connection button for verifying credentials

---

## USAePay Terminal Integration (2026-02-25)

### Terminal Payment Support
- Added physical card terminal support via USAePay Payment Engine Cloud API
- Compatible with Castles MP200 terminal (standalone WiFi, EMV, NFC, Bluetooth)
- Terminal payments appear as "Tap to Pay" option in kiosk when terminal is configured

### Backend Changes
- **usaepay_adapter.py** — Added terminal payment methods:
  - `has_terminal()` — Checks if device_key is configured
  - `initiate_terminal_payment()` — Starts payment on physical terminal via Payment Engine
  - `check_terminal_payment_status()` — Polls for payment completion
  - `cancel_terminal_payment()` — Cancels pending terminal payment
  - `TerminalPaymentResult` — Result class with request_key, status, card info

- **kiosk.py router** — Added terminal endpoints:
  - `GET /api/kiosk/terminal/info` — Returns terminal availability
  - `POST /api/kiosk/terminal/pay` — Initiates terminal payment
  - `GET /api/kiosk/terminal/status/{request_key}` — Checks payment status
  - `DELETE /api/kiosk/terminal/cancel/{request_key}` — Cancels payment

- **kiosk.py schemas** — Added terminal schemas:
  - `TerminalPaymentRequest` — member_id, plan_id, pin, save_card, use_credit
  - `TerminalPaymentInitResponse` — request_key, status, amount, error
  - `TerminalPaymentStatusResponse` — complete, approved, transaction_id, card info
  - `TerminalInfoResponse` — has_terminal, terminal_name

- **settings_service.py** — Added `usaepay_device_key` setting for terminal configuration

### Frontend Changes
- **kiosk.js API** — Added terminal API functions:
  - `getTerminalInfo()` — Check terminal availability
  - `initiateTerminalPayment()` — Start terminal payment
  - `checkTerminalPaymentStatus()` — Poll for result
  - `cancelTerminalPayment()` — Cancel pending payment

- **TerminalPaymentScreen.jsx** — New kiosk screen:
  - Shows "Tap or Insert Card" with animated terminal icon
  - Polls for payment completion every 1.5 seconds
  - Handles success, failure, timeout, and cancellation
  - Auto-navigates to success screen on approval

- **PaymentScreen.jsx** — Added "Tap to Pay" button:
  - Only shows when terminal is configured (has_terminal: true)
  - Highlighted as recommended option with brand color ring
  - Navigates to TerminalPaymentScreen

- **KioskApp.jsx** — Registered terminal screen in SCREENS map

- **Settings.jsx** — Added Terminal Device Key field in USAePay config section

### Files Added
- `frontend/src/kiosk/screens/TerminalPaymentScreen.jsx`

### Files Modified
- `backend/app/payments/usaepay_adapter.py`
- `backend/app/routers/kiosk.py`
- `backend/app/schemas/kiosk.py`
- `backend/app/services/settings_service.py`
- `frontend/src/api/kiosk.js`
- `frontend/src/kiosk/KioskApp.jsx`
- `frontend/src/kiosk/screens/PaymentScreen.jsx`
- `frontend/src/admin/pages/Settings/Settings.jsx`

---

---

## Transaction Card Tracking (2026-02-27)

### Card Name Display in Transactions
- Added `saved_card_id` field to Transaction model to track which saved card was used
- TransactionResponse schema now includes `card_last4`, `card_brand`, `card_name` fields
- Member detail transactions list shows card info for card payments
- Displays friendly name if set, otherwise shows "Visa ****1234" format

### Database Changes
- Migration `f6g7h8i9j0k1_add_transaction_saved_card.py`:
  - Adds `saved_card_id` foreign key to transactions table

### Files Modified
- `backend/app/models/transaction.py` — Added saved_card_id field and relationship
- `backend/app/schemas/transaction.py` — Added card info fields to response
- `backend/app/routers/transactions.py` — Populate card info in list response
- `backend/app/services/auto_charge_service.py` — Pass saved_card_id when creating transactions
- `frontend/src/admin/pages/Members/MemberDetail.jsx` — Display card name in transactions

---

## Automatic Backup System (2026-02-27)

### Scheduled Backups
- New backup scheduler integrated with APScheduler
- Configurable schedule: hourly, daily, or weekly
- Configurable backup hour (0-23)
- Runs automatically based on settings

### Remote Storage Options
- **Local path** — Save to local filesystem (e.g., `/backups`)
- **S3/MinIO** — Save to Amazon S3 or S3-compatible storage
  - Configurable: bucket, prefix, access key, secret key, region, custom endpoint
- **SFTP** — Save to SFTP server
  - Configurable: host, port, username, password, remote path

### Retention Policy
- Configurable retention count (3, 7, 14, 30, 60, or 90 backups)
- Automatic deletion of old backups beyond retention limit
- Works with all storage backends

### Admin UI
- New "Automatic Backups" section in Settings > Backup tab
- Enable/disable toggle
- Schedule and time configuration
- Storage type selector with backend-specific config fields
- Test Connection button to verify storage access
- Run Backup Now button for manual triggers
- Last backup status display with success/failure indicator
- Recent backups list with filenames and sizes

### Backend Changes
- **backup_service.py** — New service with:
  - `create_backup_data()` — Generates full system backup JSON
  - `save_to_local()`, `save_to_s3()`, `save_to_sftp()` — Storage backends
  - `cleanup_old_backups_*()` — Retention enforcement per backend
  - `run_backup()` — Main backup function using current settings
  - `list_backups_*()` — List available backups per backend

- **backup.py router** — New endpoints:
  - `POST /api/backup/run` — Trigger manual backup
  - `GET /api/backup/status` — Get backup config and last run status
  - `GET /api/backup/list` — List available backups
  - `POST /api/backup/test` — Test storage connection

- **main.py** — Added hourly backup scheduler job

- **settings_service.py** — Added backup settings:
  - `backup_enabled`, `backup_schedule`, `backup_hour`, `backup_retention_count`
  - `backup_remote_type`, `backup_local_path`
  - S3 settings: `backup_s3_bucket`, `backup_s3_prefix`, `backup_s3_access_key`, etc.
  - SFTP settings: `backup_sftp_host`, `backup_sftp_port`, `backup_sftp_username`, etc.
  - `backup_last_run`, `backup_last_status`, `backup_last_location`

- **requirements.txt** — Added `boto3` and `paramiko` for S3 and SFTP support

### Frontend Changes
- **backup.js API** — Added: `runBackupNow()`, `getBackupStatus()`, `listBackups()`, `testBackupConnection()`
- **Settings.jsx** — New `AutomaticBackupSection` component with full configuration UI

---

## Last Updated: 2026-02-27 (Automatic Backup System)
