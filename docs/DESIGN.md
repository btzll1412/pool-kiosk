# Pool Management System — Complete Design Document

> **IMPORTANT:** This is a living document. It MUST be updated every time a new feature is added, a design decision changes, or implementation details evolve. Every section should reflect the current state of the project — not just the original plan. If something was built differently than described here, update this document to match reality. Professional accuracy is non-negotiable.

---

## Overview

A self-hosted, local kiosk-based pool management system with RFID membership cards, payment processing, check-in tracking, and a full admin panel. Runs as a Docker container on Proxmox, accessible on the local network.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Python 3.11 + FastAPI |
| Database | PostgreSQL 15 |
| Frontend (Kiosk) | React + Tailwind CSS + Vite |
| Frontend (Admin) | React + Tailwind CSS + Vite (same app, different routes) |
| ORM | SQLAlchemy + Alembic (migrations) |
| Auth | JWT tokens (admin/staff login) |
| RFID | USB HID reader (acts as keyboard input) |
| Payment | Modular adapter pattern (plug in any processor) |
| Containerization | Docker + Docker Compose |
| Reverse Proxy | Nginx (serves frontend + proxies API) |
| Notifications | Webhook system (HA integration later) |

---

## Project File Structure

```
pool-management/
├── docker-compose.yml
├── .env.example
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   ├── app/
│   │   ├── main.py                  # FastAPI app entry point
│   │   ├── config.py                # Settings from env vars
│   │   ├── database.py              # DB connection & session
│   │   │
│   │   ├── models/                  # SQLAlchemy ORM models
│   │   │   ├── __init__.py
│   │   │   ├── member.py
│   │   │   ├── card.py
│   │   │   ├── plan.py
│   │   │   ├── membership.py
│   │   │   ├── swim_pass.py
│   │   │   ├── checkin.py
│   │   │   ├── transaction.py
│   │   │   ├── credit.py
│   │   │   └── user.py              # Admin/staff users
│   │   │
│   │   ├── schemas/                 # Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   ├── member.py
│   │   │   ├── card.py
│   │   │   ├── plan.py
│   │   │   ├── membership.py
│   │   │   ├── checkin.py
│   │   │   ├── transaction.py
│   │   │   └── auth.py
│   │   │
│   │   ├── routers/                 # API route handlers
│   │   │   ├── __init__.py
│   │   │   ├── auth.py              # Login, token refresh
│   │   │   ├── members.py           # Member CRUD
│   │   │   ├── cards.py             # Card management
│   │   │   ├── plans.py             # Plan/pricing management
│   │   │   ├── memberships.py       # Assign/manage memberships
│   │   │   ├── checkins.py          # Check-in logic
│   │   │   ├── payments.py          # Payment processing
│   │   │   ├── transactions.py      # Transaction history
│   │   │   ├── reports.py           # Analytics & reports
│   │   │   ├── settings.py          # System settings
│   │   │   └── kiosk.py             # Kiosk-specific endpoints
│   │   │
│   │   ├── services/                # Business logic layer
│   │   │   ├── __init__.py
│   │   │   ├── member_service.py
│   │   │   ├── checkin_service.py
│   │   │   ├── payment_service.py
│   │   │   ├── membership_service.py
│   │   │   ├── notification_service.py  # HA webhook placeholder
│   │   │   └── report_service.py
│   │   │
│   │   └── payments/                # Modular payment adapters
│   │       ├── __init__.py
│   │       ├── base.py              # Abstract base class
│   │       ├── cash.py              # Cash payment handler
│   │       └── stub.py              # Placeholder for real processor
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api/                     # API client functions
│       │   ├── client.js            # Axios instance
│       │   ├── members.js
│       │   ├── plans.js
│       │   ├── checkins.js
│       │   ├── payments.js
│       │   └── reports.js
│       │
│       ├── kiosk/                   # Kiosk UI (customer-facing)
│       │   ├── KioskApp.jsx         # Main kiosk router/state
│       │   ├── screens/
│       │   │   ├── IdleScreen.jsx       # Default welcome screen
│       │   │   ├── MemberScreen.jsx     # After card scan / search
│       │   │   ├── CheckinScreen.jsx    # Check-in confirmation
│       │   │   ├── PaymentScreen.jsx    # Select plan to purchase
│       │   │   ├── CashScreen.jsx       # Cash payment flow
│       │   │   ├── CardPaymentScreen.jsx # Credit card flow
│       │   │   ├── FamilyScreen.jsx     # Add family members
│       │   │   ├── ChangeScreen.jsx     # Needs change notification
│       │   │   ├── SearchScreen.jsx     # Search by name/phone
│       │   │   └── StatusScreen.jsx     # Timed status display
│       │   └── components/
│       │       ├── RFIDListener.jsx     # Captures RFID keyboard input
│       │       ├── NumPad.jsx           # Touch-friendly number pad
│       │       ├── MemberCard.jsx       # Member info display widget
│       │       ├── PlanCard.jsx         # Plan option display
│       │       └── StatusBadge.jsx      # Green/yellow/red status
│       │
│       ├── admin/                   # Admin Panel UI
│       │   ├── AdminApp.jsx
│       │   ├── layout/
│       │   │   ├── Sidebar.jsx
│       │   │   ├── Header.jsx
│       │   │   └── Layout.jsx
│       │   └── pages/
│       │       ├── Dashboard.jsx        # Overview stats
│       │       ├── Members/
│       │       │   ├── MembersList.jsx
│       │       │   ├── MemberDetail.jsx
│       │       │   └── MemberForm.jsx
│       │       ├── Plans/
│       │       │   ├── PlansList.jsx
│       │       │   └── PlanForm.jsx
│       │       ├── Transactions/
│       │       │   └── TransactionsList.jsx
│       │       ├── Reports/
│       │       │   ├── RevenueReport.jsx
│       │       │   └── SwimReport.jsx
│       │       ├── Settings/
│       │       │   └── Settings.jsx
│       │       └── Login.jsx
│       │
│       └── shared/                  # Shared components
│           ├── Button.jsx
│           ├── Modal.jsx
│           ├── Table.jsx
│           ├── DatePicker.jsx
│           └── Toast.jsx
│
└── nginx/
    ├── nginx.conf
    └── Dockerfile
```

---

## Database Schema

### members

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| first_name | VARCHAR | |
| last_name | VARCHAR | |
| phone | VARCHAR | For lookup without card |
| email | VARCHAR | Optional |
| photo_url | VARCHAR | Optional |
| credit_balance | DECIMAL | Cash credit on account |
| notes | TEXT | Admin notes |
| is_active | BOOLEAN | Can deactivate member |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### cards

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| member_id | UUID | FK → members |
| rfid_uid | VARCHAR | Unique RFID number |
| is_active | BOOLEAN | Deactivate lost cards |
| assigned_at | TIMESTAMP | |

### plans

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | VARCHAR | e.g. "Single Swim", "10-Swim Pack" |
| plan_type | ENUM | single / swim_pass / monthly |
| price | DECIMAL | |
| swim_count | INTEGER | For swim_pass type |
| duration_days | INTEGER | For monthly type |
| is_active | BOOLEAN | Show/hide from kiosk |
| display_order | INTEGER | Order on kiosk screen |
| created_at | TIMESTAMP | |

### memberships

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| member_id | UUID | FK → members |
| plan_id | UUID | FK → plans |
| plan_type | ENUM | Snapshot at time of purchase |
| swims_total | INTEGER | For swim_pass |
| swims_used | INTEGER | For swim_pass |
| valid_from | DATE | For monthly |
| valid_until | DATE | For monthly |
| is_active | BOOLEAN | |
| created_at | TIMESTAMP | |

### checkins

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| member_id | UUID | FK → members |
| membership_id | UUID | FK → memberships (nullable) |
| checkin_type | ENUM | membership / swim_pass / paid_single / free |
| guest_count | INTEGER | Extra family members |
| checked_in_at | TIMESTAMP | |
| notes | TEXT | |

### transactions

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| member_id | UUID | FK → members |
| transaction_type | ENUM | payment / refund / credit_add / credit_use / manual_adjustment |
| payment_method | ENUM | cash / card / credit / manual |
| amount | DECIMAL | |
| plan_id | UUID | FK → plans (if applicable) |
| membership_id | UUID | FK → memberships (if applicable) |
| reference_id | VARCHAR | Payment processor ref |
| notes | TEXT | Admin notes |
| created_by | UUID | FK → users (if manual) |
| created_at | TIMESTAMP | |

### users (admin/staff)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| username | VARCHAR | |
| password_hash | VARCHAR | |
| role | ENUM | admin / staff |
| is_active | BOOLEAN | |
| created_at | TIMESTAMP | |

### settings

| Column | Type | Notes |
|---|---|---|
| key | VARCHAR | Primary key |
| value | TEXT | JSON-encoded value |
| updated_at | TIMESTAMP | |

### guest_visits

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | VARCHAR | Walk-in guest name |
| phone | VARCHAR | Walk-in guest phone |
| payment_method | ENUM | cash / card |
| amount_paid | DECIMAL | |
| created_at | TIMESTAMP | |

### membership_freezes

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| membership_id | UUID | FK → memberships |
| frozen_by | UUID | FK → users |
| freeze_start | DATE | |
| freeze_end | DATE | Null if still frozen |
| days_extended | INTEGER | Added to membership end date |
| reason | TEXT | |
| created_at | TIMESTAMP | |

### saved_cards

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| member_id | UUID | FK → members |
| processor_token | VARCHAR | Tokenized card reference |
| card_last4 | VARCHAR | For display only |
| card_brand | VARCHAR | Visa, MC, etc |
| is_default | BOOLEAN | |
| auto_charge_plan_id | UUID | FK → plans (if auto-charge set) |
| auto_charge_enabled | BOOLEAN | |
| next_charge_date | DATE | |
| created_at | TIMESTAMP | |

### activity_log

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | FK → users (who did it) |
| action_type | VARCHAR | e.g. "member.update", "credit.adjust" |
| entity_type | VARCHAR | e.g. "member", "membership" |
| entity_id | UUID | ID of affected record |
| before_value | JSONB | Snapshot before change |
| after_value | JSONB | Snapshot after change |
| note | TEXT | Optional admin note |
| created_at | TIMESTAMP | |

### pin_lockouts

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| member_id | UUID | FK → members |
| failed_attempts | INTEGER | |
| locked_until | TIMESTAMP | Null if not locked |
| last_attempt_at | TIMESTAMP | |

---

## API Endpoints

### Auth

- `POST /api/auth/login` — Get JWT token
- `POST /api/auth/refresh` — Refresh token

### Kiosk (no auth required, rate limited)

- `POST /api/kiosk/scan` — Scan RFID card, returns member + status
- `POST /api/kiosk/search` — Search by name or phone
- `POST /api/kiosk/checkin` — Perform check-in
- `GET /api/kiosk/plans` — Get active plans for display
- `POST /api/kiosk/pay/cash` — Record cash payment
- `POST /api/kiosk/pay/card` — Initiate card payment
- `POST /api/kiosk/notify/change` — Trigger change notification
- `POST /api/kiosk/freeze` — Self-service membership freeze
- `POST /api/kiosk/unfreeze` — Self-service unfreeze (PIN required)
- `GET /api/kiosk/saved-cards` — List member's saved cards (PIN required)
- `POST /api/kiosk/saved-cards` — Save new card with friendly name
- `PUT /api/kiosk/saved-cards/{id}` — Rename a saved card
- `DELETE /api/kiosk/saved-cards/{id}` — Remove saved card (PIN required)
- `POST /api/kiosk/pay/split` — Split payment between cash and card

### Members (admin auth)

- `GET /api/members` — List with filters/search/pagination
- `POST /api/members` — Create member
- `GET /api/members/{id}` — Get member detail
- `PUT /api/members/{id}` — Update member
- `DELETE /api/members/{id}` — Deactivate member
- `GET /api/members/{id}/history` — Full activity history
- `POST /api/members/{id}/credit` — Manually add/remove credit
- `GET /api/members/{id}/cards` — List cards
- `POST /api/members/{id}/cards` — Assign new card
- `DELETE /api/members/{id}/cards/{card_id}` — Deactivate card

### Plans (admin auth)

- `GET /api/plans` — List all plans
- `POST /api/plans` — Create plan
- `PUT /api/plans/{id}` — Update plan
- `DELETE /api/plans/{id}` — Deactivate plan

### Memberships (admin auth)

- `POST /api/memberships` — Manually assign membership
- `PUT /api/memberships/{id}` — Modify membership
- `POST /api/memberships/{id}/adjust` — Adjust swim count manually

### Transactions (admin auth)

- `GET /api/transactions` — List with filters (member, date range, type, method)
- `POST /api/transactions/manual` — Manual transaction entry
- `PUT /api/transactions/{id}/notes` — Add notes to transaction

### Reports (admin auth)

- `GET /api/reports/dashboard` — Today's summary stats
- `GET /api/reports/revenue` — Revenue by date range, grouped by day/week/month
- `GET /api/reports/swims` — Swim counts, unique vs repeat
- `GET /api/reports/memberships` — Active membership breakdown
- `GET /api/reports/export` — CSV export

### Settings (admin auth)

- `GET /api/settings` — Get all settings
- `PUT /api/settings` — Update settings

---

## System Settings (configurable from admin)

| Setting | Default | Description |
|---|---|---|
| checkin_count_mode | each | each = count every swipe / unique = count once per day |
| family_max_guests | 5 | Max additional guests per check-in |
| checkin_return_seconds | 8 | Progress bar duration after check-in before auto-return to idle |
| inactivity_timeout_seconds | 30 | Seconds of no activity before "Still Here?" timer starts |
| inactivity_warning_seconds | 10 | Duration of "Still Here?" countdown before forced return to idle |
| change_notification_webhook | "" | HA webhook URL (when ready) |
| pool_name | "Pool" | Displayed on kiosk |
| currency_symbol | "$" | |
| cash_box_instructions | "" | Text shown on cash screen |
| first_card_fee | 0.00 | Fee for first card issuance |
| replacement_card_fee | 0.00 | Fee for replacement card |
| pin_max_attempts | 3 | Failed PIN attempts before lockout |
| pin_length | 4 | PIN digit length (4 or 6) |
| auto_charge_enabled | true | Allow recurring billing |
| guest_visit_enabled | true | Allow walk-in guests without account |
| split_payment_enabled | true | Allow splitting payment between cash and card |

---

## Kiosk Screen Flow

```
[IDLE SCREEN]
  → Scan card → [MEMBER SCREEN]
  → Tap "Search Account" → [SEARCH SCREEN] → [MEMBER SCREEN]
  → Tap "Guest Visit" → [GUEST SCREEN]
  → Tap "New Member" → [SIGNUP SCREEN]

[MEMBER SCREEN]  (shows name, status, balance)
  → BIG "Check In" button (primary action)
  → "Manage Account" button (secondary)
  → If expired/empty: auto-prompt shown to purchase plan
  → Inactivity timer → "Still Here?" warning → auto-return to idle

[CHECK-IN SCREEN]
  → "Checked In! Anyone joining you today?"
  → Select guest count (0-5)
  → Confirm → logs check-in
  → Progress bar runs for X seconds (checkin_return_seconds)
  → Auto-returns to idle — ready for next person

[MANAGE ACCOUNT SCREEN]  (requires PIN)
  → Enter PIN → unlock account menu
  → Options:
      - View membership status & history
      - Purchase / top up plan
      - Freeze membership (enter X days or pick end date)
      - Manage cards on file
      - Change PIN
  → Inactivity timer on every sub-screen → "Still Here?" → auto-return to idle

[FREEZE SCREEN]  (self-service)
  → "Freeze for how long?"
  → Enter number of days OR pick a return date from calendar
  → Confirm with PIN
  → "Your membership has been frozen until [date]"
  → Progress bar → auto-return to idle

[FROZEN CARD SCAN]
  → Member scans card while frozen
  → "Your membership is frozen until [date]. Would you like to unfreeze?"
  → Tap "Unfreeze" → enter PIN → membership resumes
  → "Welcome back! Your membership is now active" → progress bar → idle

[MANAGE CARDS SCREEN]
  → List of saved cards with friendly names (e.g. "My Visa ****4242")
  → Add new card → payment processor flow → "Save this card?"
      → Auto-generated name shown, tap to rename
      → e.g. "Visa ending 4242" → user types "My Visa"
  → Delete card → confirm with PIN
  → Set as default card

[PAYMENT SCREEN]
  → Shows available plans with prices
  → Select plan
  → Choose payment method:
      - Pay by Card (saved card or new card)
      - Pay by Cash
      - Split (cash + card)

[SPLIT PAYMENT SCREEN]
  → Shows total amount due
  → "How much cash are you putting in?" → numpad
  → Remainder automatically shown as card charge
  → Cash portion follows normal cash flow (exact/overpay/change)
  → Card portion charged to saved card or new card

[CASH SCREEN]
  → Numpad to enter amount
  → If exact → "Place $X in the cash box. Thank you!"
  → If overpaid → extra added to account credit, shown on screen
  → If needs change → [CHANGE SCREEN]

[CHANGE SCREEN]
  → "Place your cash in the box. Someone will bring your change shortly"
  → Notification fired to staff
  → Progress bar → auto-return to idle

[CARD PAYMENT SCREEN]
  → Use saved card (shown with friendly name) or tap new card
  → On new card → "Save this card for future use?" → name it
  → On success → receipt option → back to member screen
  → Progress bar → auto-return to idle

[GUEST SCREEN]
  → Enter name + phone
  → Pay for single swim (card or cash)
  → Progress bar → auto-return to idle

[INACTIVITY TIMER — applies to ALL screens]
  → No touch activity for X seconds (inactivity_timeout_seconds)
  → Subtle progress bar appears at bottom of screen
  → "Still Here?" button appears — tap to reset timer
  → If not tapped within inactivity_warning_seconds → return to idle
```

---

## Payment Adapter Interface

```python
class BasePaymentAdapter:
    def initiate_payment(self, amount: Decimal, member_id: str, description: str) -> PaymentSession
    def check_status(self, session_id: str) -> PaymentStatus
    def refund(self, transaction_id: str, amount: Decimal) -> RefundResult
    def tokenize_card(self, card_last4: str, card_brand: str, member_id: str) -> str
    def charge_saved_card(self, token: str, amount: Decimal, member_id: str, description: str) -> SavedCardChargeResult
```

Any new payment processor just implements this interface. Drop in and configure via environment variable. The `tokenize_card` and `charge_saved_card` methods were added in Phase 5 for recurring billing support.

---

## Docker Compose Services

```yaml
services:
  postgres:       # PostgreSQL database
  backend:        # FastAPI app
  frontend:       # React app (built static)
  nginx:          # Reverse proxy, serves everything on port 80
```

Single command to run: `docker compose up -d`

---

## Environment Variables (.env)

```
DATABASE_URL=postgresql://pool:password@postgres:5432/pooldb
SECRET_KEY=your-jwt-secret-key
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=changeme
PAYMENT_ADAPTER=stub
POOL_NAME=My Pool
```

---

## Complete User Journey & Cases

### New Member Signup

- At kiosk: enter name, phone, email (optional), scan card, select plan, pay
- At admin panel: staff manually registers member
- PIN set during signup — required for payments/adding money
- If email provided, can self-reset PIN via email link
- Admin can always reset PIN manually

### Case 1 — Monthly Membership

- Scan card → "Welcome John! Valid until March 15" → Check In
- On expiry → prompted to renew on the spot

### Case 2 — Swim Pass (X swims)

- Scan card → "Welcome Sarah! 4 swims remaining" → Check In → deducts one
- Last swim → warning shown, prompt to top up
- Zero swims → must purchase before checking in

### Case 3 — Pay Per Swim (has account, no active plan)

- Scan card → no active plan → select single swim → pay → check in

### Case 4 — Walk-in Guest (no account, no card)

- Tap "Guest Visit" on idle screen
- Enter name + phone number only
- Select single swim, pay by card or cash
- Logged as guest transaction (not linked to a member account)

### Case 5 — Cash Exact

- Enter amount → "Place $X in cash box. Thank you!"

### Case 6 — Cash Overpay

- Extra amount added to account as credit

### Case 7 — Cash Needs Change

- "Place cash in box. Someone will bring your change shortly"
- Notification fired to staff

### Case 8 — Using Account Credit

- Credit applied first, remainder paid by card or cash

### Case 9 — Family / Guests

- After check-in prompt: "Anyone joining you?" → select count
- Deducts from plan accordingly, or prompts to pay for extras

### Case 10 — Lost / New Card

- Admin deactivates old card, scans new card on account
- Card fee charged automatically if configured in settings
- All history and balance remains intact

### Case 11 — Adding Money / Purchasing at Kiosk

- Scan card → tap "Add Money" or "Purchase Plan"
- System prompts for PIN
- On success → shows all available plans + option to save card on file
- Option to enable auto-charge/recurring on selected plan
- Auto-charge continues until member cancels or changes plan
- If PIN forgotten → "Forgot PIN?" → email reset link (if email on file) or contact admin

### Case 12 — Membership Freeze

- Admin freezes membership with a reason and date
- End date automatically extended by freeze duration
- Member sees "Membership frozen" on kiosk scan
- Admin unfreezes when member returns

---

## Admin Activity Log

Every action in the admin panel is logged with:

- Which staff/admin performed it
- What was changed (before and after values)
- Timestamp
- Optional note
- Covers: member edits, manual credit adjustments, PIN resets, membership modifications, plan changes, card assignments, transaction notes, setting changes

---

## Card Fee System

- Configurable in admin settings
- First card fee: $X (can be $0)
- Replacement card fee: $X
- Automatically added to transaction when card is issued
- Can be waived manually by admin per case

---

## PIN System

- 4-6 digit PIN set at signup
- Required for: purchasing plans, adding money, saving card on file
- Reset options: email link (if email on file) or admin manual reset
- Admin reset logged in activity log
- PIN attempts limited (configurable) — locks out after X failed attempts, admin can unlock

---

## Recurring / Auto-Charge

- Member saves credit card on file after PIN verification
- Selects a monthly plan to auto-renew (auto-charge is limited to monthly plans)
- System charges automatically on renewal date via APScheduler daily job at 06:00
- Only one card per member can have auto-charge enabled at a time
- Member or admin can cancel anytime from kiosk saved cards screen or admin panel
- All auto-charges logged as transactions with saved card reference in notes
- When auto-charge is enabled, `next_charge_date` is set to current date + plan duration
- After each successful charge, `next_charge_date` advances by the plan's duration days
- Members can also pay with saved cards on-demand at the kiosk (without auto-charge)

---

## Future Integrations (placeholders ready)

- **Home Assistant:** webhook fired on change request, low balance alerts, daily swim count
- **FusionPBX:** outbound call trigger when change is needed
- **Payment Processor:** drop in Square, Stripe Terminal, or any other via adapter
- **Email/SMS:** receipt sending, membership expiry reminders, PIN reset, auto-charge notices

---

## Development Phases

1. **Phase 1** — Database + Backend API (all endpoints, business logic)
2. **Phase 2** — Admin Panel (full CRUD, reports, settings, activity log)
3. **Phase 3** — Kiosk UI (all screens, RFID listener, touch-optimized)
4. **Phase 4** — Payment stub + cash flow + PIN system
5. **Phase 5** — Recurring billing + saved cards
6. **Phase 6** — Docker packaging + Nginx config
7. **Phase 7** — HA/notification hooks
8. **Phase 8** — Real payment processor integration

---

## Changelog

> Track all significant changes to this document below. Add new entries at the top.

| Date | Change | Author |
|---|---|---|
| 2026-02-18 | Phase 5: Added tokenize_card/charge_saved_card to payment adapter, updated recurring/auto-charge section | — |
| 2026-02-18 | Initial design document created from planning session | — |
