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
| Payment | Modular adapter pattern — Stub, Cash, Stripe, Square, Sola |
| Containerization | Docker + Docker Compose |
| Reverse Proxy | Nginx (serves frontend + proxies API) |
| Notifications | Webhook system (8 events), SMTP email, SIP/FusionPBX calls |

---

## Project File Structure

```
pool-kiosk/
├── docker-compose.yml
├── .env.example
├── README.md
├── CLAUDE.md                        # Claude Code instructions
│
├── static/
│   └── nfc_reader.py                # PC/SC NFC reader script for kiosk
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   ├── tests/                       # pytest test suite
│   │   ├── test_auth.py
│   │   ├── test_kiosk.py
│   │   ├── test_payments.py
│   │   └── test_pin.py
│   ├── app/
│   │   ├── main.py                  # FastAPI app entry point + APScheduler
│   │   ├── config.py                # Settings from env vars
│   │   ├── database.py              # DB connection & session
│   │   │
│   │   ├── models/                  # SQLAlchemy ORM models (13 models)
│   │   │   ├── __init__.py
│   │   │   ├── member.py            # Member with PIN hash
│   │   │   ├── card.py              # RFID cards
│   │   │   ├── plan.py              # Membership plans
│   │   │   ├── membership.py        # Active memberships
│   │   │   ├── membership_freeze.py # Freeze tracking
│   │   │   ├── checkin.py           # Check-in records
│   │   │   ├── transaction.py       # Payment transactions
│   │   │   ├── saved_card.py        # Saved payment cards
│   │   │   ├── guest_visit.py       # Walk-in guests
│   │   │   ├── activity_log.py      # Admin audit trail
│   │   │   ├── pin_lockout.py       # PIN attempt tracking
│   │   │   ├── setting.py           # System settings
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
│   │   │   ├── kiosk.py
│   │   │   ├── settings.py
│   │   │   ├── report.py
│   │   │   └── auth.py
│   │   │
│   │   ├── routers/                 # API route handlers (14 routers)
│   │   │   ├── __init__.py
│   │   │   ├── auth.py              # Login, token refresh, password reset
│   │   │   ├── backup.py            # System backup/restore
│   │   │   ├── cards.py             # Card management
│   │   │   ├── checkins.py          # Check-in history + filtering
│   │   │   ├── guests.py            # Guest visit history
│   │   │   ├── kiosk.py             # Kiosk-specific endpoints
│   │   │   ├── members.py           # Member CRUD + CSV import/export
│   │   │   ├── memberships.py       # Assign/manage memberships
│   │   │   ├── nfc.py               # NFC WebSocket + broadcast
│   │   │   ├── payments.py          # Payment processing
│   │   │   ├── plans.py             # Plan/pricing management
│   │   │   ├── reports.py           # Analytics & reports
│   │   │   ├── settings.py          # System settings + test endpoints
│   │   │   └── transactions.py      # Transaction history
│   │   │
│   │   ├── services/                # Business logic layer (16 services)
│   │   │   ├── __init__.py
│   │   │   ├── activity_service.py     # Admin audit logging
│   │   │   ├── auth_service.py         # JWT + password hashing
│   │   │   ├── auto_charge_service.py  # Recurring billing scheduler
│   │   │   ├── checkin_service.py      # Check-in logic
│   │   │   ├── email_service.py        # SMTP email sending
│   │   │   ├── member_service.py       # Member CRUD
│   │   │   ├── membership_service.py   # Membership management
│   │   │   ├── nfc_reader_service.py   # WebSocket client management
│   │   │   ├── notification_service.py # Webhook system (8 events)
│   │   │   ├── payment_service.py      # Payment processing
│   │   │   ├── pin_service.py          # PIN verification + lockout
│   │   │   ├── rate_limit.py           # Kiosk rate limiting
│   │   │   ├── report_service.py       # Reports + stats
│   │   │   ├── seed.py                 # Default admin + settings
│   │   │   ├── settings_service.py     # DB settings management
│   │   │   └── sip_service.py          # FusionPBX SIP calls
│   │   │
│   │   └── payments/                # Modular payment adapters (5 adapters)
│   │       ├── __init__.py          # get_payment_adapter()
│   │       ├── base.py              # Abstract base class
│   │       ├── cash.py              # Cash payment handler
│   │       ├── stub.py              # Test adapter (always succeeds)
│   │       ├── stripe_adapter.py    # Stripe SDK integration
│   │       ├── square_adapter.py    # Square SDK integration
│   │       └── sola_adapter.py      # Sola REST API integration
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
│       ├── context/
│       │   ├── AuthContext.jsx       # Admin auth state
│       │   └── ThemeContext.jsx      # Dark mode theme provider
│       ├── hooks/
│       │   └── useNFCReader.js       # WebSocket hook for NFC card scans
│       ├── api/                     # API client functions
│       │   ├── client.js            # Axios instance with JWT interceptor
│       │   ├── auth.js
│       │   ├── members.js
│       │   ├── plans.js
│       │   ├── checkins.js
│       │   ├── kiosk.js             # Kiosk API (21 endpoints)
│       │   ├── payments.js
│       │   ├── settings.js          # Settings + test connection APIs
│       │   └── reports.js
│       │
│       ├── kiosk/                   # Kiosk UI (customer-facing)
│       │   ├── KioskApp.jsx         # Main kiosk state machine
│       │   ├── screens/             # 18 kiosk screens
│       │   │   ├── IdleScreen.jsx
│       │   │   ├── MemberScreen.jsx
│       │   │   ├── CheckinScreen.jsx
│       │   │   ├── SignUpScreen.jsx
│       │   │   ├── SearchScreen.jsx
│       │   │   ├── PinScreen.jsx
│       │   │   ├── PaymentScreen.jsx
│       │   │   ├── CashScreen.jsx
│       │   │   ├── CardPaymentScreen.jsx
│       │   │   ├── SplitPaymentScreen.jsx
│       │   │   ├── ChangeScreen.jsx
│       │   │   ├── StatusScreen.jsx
│       │   │   ├── GuestScreen.jsx
│       │   │   ├── ManageAccountScreen.jsx
│       │   │   ├── FreezeScreen.jsx
│       │   │   ├── SavedCardsScreen.jsx
│       │   │   ├── AddCardScreen.jsx
│       │   │   └── AutoChargeScreen.jsx
│       │   └── components/          # 7 kiosk components
│       │       ├── RFIDListener.jsx
│       │       ├── NumPad.jsx
│       │       ├── MemberCard.jsx
│       │       ├── PlanCard.jsx
│       │       ├── InactivityTimer.jsx
│       │       ├── KioskButton.jsx
│       │       └── AutoReturnBar.jsx
│       │
│       ├── admin/                   # Admin Panel UI
│       │   ├── AdminApp.jsx
│       │   ├── layout/
│       │   │   ├── Sidebar.jsx
│       │   │   ├── Header.jsx
│       │   │   └── Layout.jsx
│       │   └── pages/
│       │       ├── Dashboard.jsx
│       │       ├── Checkins/
│       │       │   └── CheckinsList.jsx
│       │       ├── Members/
│       │       │   ├── MembersList.jsx
│       │       │   ├── MemberDetail.jsx  # Uses useNFCReader hook
│       │       │   └── MemberForm.jsx
│       │       ├── Plans/
│       │       │   ├── PlansList.jsx
│       │       │   └── PlanForm.jsx
│       │       ├── Transactions/
│       │       │   └── TransactionsList.jsx
│       │       ├── Guests/
│       │       │   └── GuestsList.jsx
│       │       ├── Reports/
│       │       │   ├── RevenueReport.jsx
│       │       │   └── SwimReport.jsx
│       │       ├── Settings/
│       │       │   └── Settings.jsx      # 4 tabs: General, Payments, Notifications, Backup
│       │       ├── Setup.jsx             # First-time admin setup wizard
│       │       └── Login.jsx
│       │
│       └── shared/                  # Shared components (12)
│           ├── Button.jsx
│           ├── Modal.jsx
│           ├── Table.jsx
│           ├── Badge.jsx
│           ├── Card.jsx
│           ├── Input.jsx
│           ├── Select.jsx
│           ├── StatCard.jsx
│           ├── EmptyState.jsx
│           ├── PageHeader.jsx
│           ├── ConfirmDialog.jsx
│           └── Skeleton.jsx
│
├── nginx/
│   ├── nginx.conf
│   └── Dockerfile
│
└── docs/
    ├── DESIGN.md                    # This file
    └── STATUS.md                    # Development progress
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
- `POST /api/kiosk/verify-pin` — Verify member PIN before sensitive operations
- `POST /api/kiosk/signup` — Self-registration for new members

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
- `GET /api/members/{id}/memberships` — List member's memberships with plan details
- `GET /api/members/{id}/saved-cards` — List member's saved payment cards
- `DELETE /api/members/{id}/saved-cards/{card_id}` — Remove saved card
- `GET /api/members/{id}/pin-status` — Get PIN lockout status
- `POST /api/members/{id}/unlock-pin` — Unlock member's PIN (admin)
- `GET /api/members/export/csv` — Export all members as CSV
- `POST /api/members/import/csv` — Import members from CSV file

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

- `GET /api/settings` — Get all settings (sensitive values masked)
- `PUT /api/settings` — Update settings (masked values filtered out)
- `POST /api/settings/webhook-test` — Test a webhook event type
- `POST /api/settings/payment-test?processor=<type>` — Test payment processor connection
- `POST /api/settings/email-test` — Test SMTP email connection
- `POST /api/settings/sip-test` — Test SIP/FusionPBX connection

### Backup (admin auth)

- `GET /api/backup/export` — Export full system data as JSON
- `POST /api/backup/import` — Import system data from JSON file (replaces all data)

### Guests (admin auth)

- `GET /api/guests` — List guest visits with pagination

---

## System Settings (configurable from admin)

| Setting | Default | Description |
|---|---|---|
| checkin_count_mode | each | each = count every swipe / unique = count once per day |
| family_max_guests | 5 | Max additional guests per check-in |
| checkin_return_seconds | 8 | Progress bar duration after check-in before auto-return to idle |
| inactivity_timeout_seconds | 30 | Seconds of no activity before "Still Here?" timer starts |
| inactivity_warning_seconds | 10 | Duration of "Still Here?" countdown before forced return to idle |
| change_notification_webhook | "" | Legacy — migrated to webhook_change_needed |
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
| webhook_change_needed | "" | Webhook URL for change-needed events |
| webhook_checkin | "" | Webhook URL for check-in events |
| webhook_membership_expiring | "" | Webhook URL for membership expiring warnings |
| webhook_membership_expired | "" | Webhook URL for expired memberships |
| webhook_low_balance | "" | Webhook URL for low balance alerts |
| webhook_auto_charge_success | "" | Webhook URL for successful auto-charges |
| webhook_auto_charge_failed | "" | Webhook URL for failed auto-charges |
| webhook_daily_summary | "" | Webhook URL for daily summary stats |
| low_balance_threshold | 5.00 | Balance threshold for low_balance webhook |
| membership_expiry_warning_days | 7 | Days before expiry to fire warning webhook |
| **Payment Processor** | | |
| payment_processor | "stub" | Active processor: stub, cash, stripe, square, sola |
| stripe_api_key | "" | Stripe publishable API key |
| stripe_secret_key | "" | Stripe secret key (masked in UI) |
| stripe_webhook_secret | "" | Stripe webhook signing secret (masked) |
| square_access_token | "" | Square access token (masked) |
| square_location_id | "" | Square location ID |
| square_environment | "sandbox" | sandbox or production |
| sola_api_key | "" | Sola API key (masked) |
| sola_api_secret | "" | Sola API secret (masked) |
| sola_merchant_id | "" | Sola merchant ID |
| sola_environment | "sandbox" | sandbox or production |
| **Email (SMTP)** | | |
| email_smtp_host | "" | SMTP server hostname |
| email_smtp_port | "587" | SMTP port |
| email_smtp_username | "" | SMTP username |
| email_smtp_password | "" | SMTP password (masked) |
| email_from_address | "" | From email address |
| email_from_name | "Pool Management" | From display name |
| email_tls_enabled | "true" | Enable STARTTLS |
| **SIP / Phone** | | |
| sip_enabled | "false" | Enable SIP call integration |
| sip_server | "" | SIP server address |
| sip_port | "5060" | SIP port |
| sip_username | "" | SIP username |
| sip_password | "" | SIP password (masked) |
| sip_caller_id | "" | Caller ID for outbound calls |
| sip_change_needed_number | "" | Phone number for change-needed notifications |
| sip_fusionpbx_api_url | "" | FusionPBX REST API base URL |
| sip_fusionpbx_api_key | "" | FusionPBX API key (masked) |

---

## Kiosk Screen Flow

```
[IDLE SCREEN]
  → Scan card → [MEMBER SCREEN]
  → Tap "Search Account" → [SEARCH SCREEN] → [MEMBER SCREEN]
  → Tap "Guest Visit" → [GUEST SCREEN]
  → Tap "New Member" → [SIGNUP SCREEN] → [MEMBER SCREEN]

[SIGNUP SCREEN]
  → Enter first name, last name, phone (required), email (optional)
  → Set 4-digit PIN
  → Submit → creates member → proceeds to [MEMBER SCREEN]
  → Can then check in or purchase plan

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
  → Shows total amount due with live cash/card split display
  → "Enter Cash Amount" → numpad, remainder auto-calculated for card
  → Select saved card for remainder (or use new card)
  → Confirm → records cash transaction + charges card → creates membership
  → If cash covers full amount, falls back to regular cash flow

[CASH SCREEN]
  → Numpad to enter amount
  → If exact → "Place $X in the cash box. Thank you!"
  → If overpaid → two buttons shown:
      - "Add $X to Credit" → adds to account balance
      - "I Need $X Change" → [CHANGE SCREEN] + staff notification

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
    def __init__(self, config: dict | None = None):
        self.config = config or {}

    def initiate_payment(self, amount: Decimal, member_id: str, description: str) -> PaymentSession
    def check_status(self, session_id: str) -> PaymentStatus
    def refund(self, transaction_id: str, amount: Decimal) -> RefundResult
    def tokenize_card(self, card_last4: str, card_brand: str, member_id: str) -> str
    def charge_saved_card(self, token: str, amount: Decimal, member_id: str, description: str) -> SavedCardChargeResult
    def test_connection(self) -> tuple[bool, str]  # Returns (success, message)
```

**Available adapters:**
| Adapter | Config Source | SDK/Library |
|---|---|---|
| `stub` | None (always succeeds) | — |
| `cash` | None (rejects card ops) | — |
| `stripe` | DB settings (`stripe_*`) | `stripe` Python SDK |
| `square` | DB settings (`square_*`) | `squareup` Python SDK |
| `sola` | DB settings (`sola_*`) | `httpx` REST calls |

The active processor is configured via `payment_processor` DB setting (not env var). `get_payment_adapter(db)` reads the setting and instantiates the appropriate adapter with processor-specific config from the database.

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
POOL_NAME=My Pool
```

> **Note:** Payment processor, email, and SIP configuration is managed through Admin Settings (stored in the database), not environment variables.

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

## Webhook / Notification System

The system supports 8 webhook event types, each with its own configurable URL. Webhooks are fire-and-forget (5s timeout, errors logged but never block the user flow). Designed primarily for Home Assistant automations but compatible with any webhook consumer.

### Webhook Payload Schema

Every webhook POST sends:
```json
{
  "event": "<event_type>",
  "timestamp": "2026-02-18T14:30:00.000000",
  "data": { ...event-specific fields... }
}
```

### Event Types & Payloads

| Event | Trigger | Data Fields |
|---|---|---|
| `change_needed` | Cash payment needs change | `member_name`, `amount` |
| `checkin` | Member checks in at kiosk | `member_name`, `member_id`, `checkin_type`, `guest_count` |
| `membership_expiring` | Daily 07:00 check | `member_name`, `member_id`, `days_remaining`, `plan_name` |
| `membership_expired` | Daily 07:00 check | `member_name`, `member_id`, `plan_name` |
| `low_balance` | Credit payment drops below threshold | `member_name`, `member_id`, `balance`, `threshold` |
| `auto_charge_success` | Daily 06:00 auto-charge succeeds | `member_name`, `member_id`, `plan_name`, `amount`, `card_last4` |
| `auto_charge_failed` | Daily 06:00 auto-charge fails | `member_name`, `member_id`, `plan_name`, `amount`, `card_last4`, `reason` |
| `daily_summary` | Daily 21:00 summary | `pool_name`, `date`, `total_checkins_today`, `unique_members_today`, `revenue_today`, `active_memberships`, `guests_today` |

### Scheduled Jobs (APScheduler)

| Job | Schedule | Description |
|---|---|---|
| Auto-charge | 06:00 daily | Process recurring billing on saved cards |
| Membership expiry check | 07:00 daily | Fire expiring/expired webhooks for monthly memberships |
| Daily summary | 21:00 daily | Fire daily stats webhook |

### Admin Webhook Test

`POST /api/settings/webhook-test?event_type=<type>` — sends a test payload to the configured URL for the given event type.

---

## Logging & Error Handling Standards

### Backend Logging

Every Python module (services, routers, payment adapters) must include a module-level logger:

```python
import logging
logger = logging.getLogger(__name__)
```

**Global format** (configured in `app/main.py`):

```
%(asctime)s [%(levelname)s] %(name)s: %(message)s
```

Example output: `2026-02-18 14:32:01 [INFO] app.services.payment_service: Cash payment completed: member=abc123, plan=Monthly, amount=$45.00, tx=tx789`

**Log level guidelines:**

| Level | When to Use | Examples |
|---|---|---|
| `logger.info()` | Successful operations, state changes | Payment completed, member created, check-in recorded |
| `logger.warning()` | Rejected requests, failed attempts, degraded state | Insufficient balance, PIN lockout, invalid card |
| `logger.debug()` | Low-priority or high-frequency events | Activity log entries, PIN verification success |
| `logger.exception()` | Caught exceptions where traceback is needed | Unexpected DB errors, webhook delivery failures |

**Structured messages** use key=value pairs for easy parsing:

```python
logger.info("Cash payment completed: member=%s, plan=%s, amount=$%s, tx=%s", member_id, plan.name, plan.price, tx.id)
logger.warning("PIN attempt on locked account: member=%s, locked_until=%s", member_id, lockout.locked_until)
```

### Frontend Error Handling

**All API `.catch()` blocks** must extract the FastAPI error detail:

```javascript
.catch((err) => toast.error(err.response?.data?.detail || "Fallback message"))
```

**Rules:**

- Every promise chain or `async/await` must have a `.catch()` or `try/catch` — no silent failures
- Error toasts use `react-hot-toast` and show the server's `detail` message when available
- Fallback messages must be specific to the operation (e.g., "Failed to load members" not "Something went wrong")
- `console.warn()` is acceptable for non-user-facing failures (e.g., loading saved cards in background)

**Pattern for admin pages (data loading in useEffect):**

```javascript
useEffect(() => {
  getData()
    .then(setData)
    .catch((err) => toast.error(err.response?.data?.detail || "Failed to load data"))
    .finally(() => setLoading(false));
}, []);
```

**Pattern for action handlers:**

```javascript
try {
  await performAction(payload);
  toast.success("Action completed");
} catch (err) {
  toast.error(err.response?.data?.detail || "Action failed");
}
```

---

## Integrations

- **Home Assistant:** Full webhook integration (8 event types, per-event URL, fire-and-forget)
- **FusionPBX / SIP:** Outbound call origination for change-needed notifications via REST API
- **Payment Processors:** Stripe (PaymentIntent + Customer API), Square (Payments + Customers API), Sola (REST API) — all configurable from admin
- **Email (SMTP):** Auto-charge receipts, membership expiring/expired notifications — SMTP config in admin settings
- **NFC/RFID Reader:** PC/SC smart card reader support with WebSocket broadcast to admin browsers
- **Future:** SMS notifications, PIN reset via email link

---

## NFC Reader Integration

The system supports two methods for RFID card input:

### Method 1: USB HID Keyboard Emulation

Most RFID readers act as USB keyboards — they type the card UID and press Enter. The kiosk frontend's `RFIDListener` component captures this keyboard input. No additional software needed.

### Method 2: PC/SC Smart Card Reader

For PC/SC-compatible readers (ACR122U, HID Omnikey, etc.), a Python script runs on the kiosk computer:

**Files:**
- `static/nfc_reader.py` — The reader script
- `backend/app/routers/nfc.py` — API endpoints
- `backend/app/services/nfc_reader_service.py` — WebSocket client management
- `frontend/src/hooks/useNFCReader.js` — React hook for admin browsers

**Flow:**
```
[Card Tap] → [nfc_reader.py] → pyautogui.typewrite(uid) → [Kiosk UI]
                            ↘ POST /api/nfc/broadcast → WebSocket → [Admin Browser]
```

**API Endpoints:**
| Endpoint | Method | Description |
|---|---|---|
| `/api/nfc/script` | GET | Download the NFC reader Python script |
| `/api/nfc/broadcast` | POST | Broadcast card scan to connected admin browsers |
| `/api/nfc/ws` | WebSocket | Admin browsers connect here to receive card scans |
| `/api/nfc/status` | GET | Get count of connected WebSocket clients |

**Admin Card Assignment:**
When viewing a member's detail page in admin, the `useNFCReader` hook connects to the WebSocket. When a card is tapped at the kiosk, the UID is automatically populated in the "Assign Card" field.

**Configuration:**
The `BACKEND_URL` in the script must be set to the pool-kiosk server address (e.g., `http://192.168.1.153`).

---

## Development Phases

1. **Phase 1** — Database + Backend API (all endpoints, business logic)
2. **Phase 2** — Admin Panel (full CRUD, reports, settings, activity log)
3. **Phase 3** — Kiosk UI (all screens, RFID listener, touch-optimized)
4. **Phase 4** — Payment stub + cash flow + PIN system
5. **Phase 5** — Recurring billing + saved cards
6. **Phase 6** — Docker packaging + Nginx config
7. **Phase 7** — HA/notification hooks
8. **Phase 8** — Payment processors (Stripe/Square/Sola), email, SIP, dark mode, kiosk transitions, skeletons
9. **Phase 9** — UX polish (kiosk signup, PIN verify, search debounce, swim pass stacking), admin enhancements (backup/restore, membership management, settings tabs, guest visits page)

---

## Changelog

> Track all significant changes to this document below. Add new entries at the top.

| Date | Change | Author |
|---|---|---|
| 2026-02-20 | Added NFC Reader Integration section documenting PC/SC reader support and WebSocket broadcast architecture | — |
| 2026-02-19 | Phase 9: Added kiosk signup, PIN verify endpoint, backup/restore, member memberships management, swim pass stacking, guest visits page, settings tabs, admin PIN unlock, members CSV import/export | — |
| 2026-02-18 | Phase 8: Added Stripe/Square/Sola payment adapters, email service, SIP service, dark mode, kiosk transitions, skeletons, 30+ new DB settings | — |
| 2026-02-18 | Added Logging & Error Handling Standards section; consistent logging across all backend modules; frontend error handling audit | — |
| 2026-02-18 | Bug fixes: split payment (frontend + backend), cash change_due flow, test suite (38 tests), bcrypt compat, JSONB→JSON | — |
| 2026-02-18 | Phase 7: Added webhook notification system (8 events), scheduled jobs, admin webhook config UI, payload docs | — |
| 2026-02-18 | Phase 5: Added tokenize_card/charge_saved_card to payment adapter, updated recurring/auto-charge section | — |
| 2026-02-18 | Initial design document created from planning session | — |
