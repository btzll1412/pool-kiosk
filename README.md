# Pool Kiosk

A self-hosted pool management system with RFID membership cards, payment processing, check-in tracking, and a full admin panel. Designed to run on a local network via Docker on Proxmox.

## Features

- **Kiosk UI** -- Touch-optimized customer-facing interface with RFID card scanning, plan purchases, cash/card/split payments, membership freeze/unfreeze, saved card management, and auto-charge
- **Admin Panel** -- Full management dashboard with member CRUD, plan management, transaction history, revenue/swim reports, system settings, and activity audit log
- **Payment Processors** -- Stripe, Square, and Sola adapters (configurable from admin settings, no env vars needed)
- **Notifications** -- Webhooks (8 event types, Home Assistant compatible), SMTP email (receipts, expiry alerts), SIP/FusionPBX phone calls (change-needed)
- **Dark Mode** -- Full dark mode support across the admin panel
- **Recurring Billing** -- Auto-charge on saved cards with daily scheduler

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL 15 |
| Frontend | React, Tailwind CSS, Vite |
| Deployment | Docker Compose, Nginx reverse proxy |

---

## Installation on Proxmox

### Prerequisites

- Proxmox VE 7+ host
- A Debian/Ubuntu LXC template downloaded (Proxmox GUI > local storage > CT Templates > Download `debian-12-standard`)

### Step 1: Create an LXC Container

In the **Proxmox web UI** (`https://<proxmox-ip>:8006`):

1. Click **Create CT**
2. Configure:
   - **Hostname:** `pool-kiosk`
   - **Template:** `debian-12-standard` (or `ubuntu-22.04-standard`)
   - **Disk:** 10 GB (minimum)
   - **CPU:** 2 cores
   - **Memory:** 2048 MB
   - **Network:** DHCP or static IP on your LAN (e.g., `192.168.1.50/24`, gateway `192.168.1.1`)
   - Set a root password
3. **Before starting**, enable nesting (required for Docker):
   - Select the container > **Options** > **Features** > check **Nesting**
   - Or from the Proxmox host shell:
     ```bash
     pct set <CTID> --features nesting=1
     ```
4. **Start** the container

### Step 2: Install Docker

SSH into the container (or use the Proxmox console):

```bash
ssh root@<container-ip>
```

Install Docker:

```bash
apt update && apt install -y curl git
curl -fsSL https://get.docker.com | sh
```

Verify:

```bash
docker --version
docker compose version
```

### Step 3: Clone the Repository

```bash
cd /opt
git clone https://github.com/btzll1412/pool-kiosk.git
cd pool-kiosk
```

### Step 4: Configure Environment

```bash
cp .env.example .env
nano .env
```

Edit these values:

```
DB_PASSWORD=<strong-random-password>
SECRET_KEY=<random-64-character-string>
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=<your-admin-password>
POOL_NAME=Your Pool Name
```

To generate random values:

```bash
# Generate a strong DB password
openssl rand -base64 24

# Generate a JWT secret key
openssl rand -hex 32
```

### Step 5: Start the Application

```bash
docker compose up -d
```

First startup takes 2-3 minutes (builds images, runs database migrations, seeds default admin user and settings).

Watch the logs to confirm everything starts:

```bash
docker compose logs -f
```

You should see:

```
backend-1   | INFO:     Application startup complete.
backend-1   | INFO:     Uvicorn running on http://0.0.0.0:8000
```

Press `Ctrl+C` to stop following logs (containers keep running).

### Step 6: Access the System

| Interface | URL | Description |
|---|---|---|
| Kiosk | `http://<container-ip>/kiosk` | Customer-facing touch screen |
| Admin | `http://<container-ip>/admin` | Management dashboard |
| API Docs | `http://<container-ip>/docs` | Interactive API documentation |

Log in to the admin panel with the credentials from your `.env` file.

---

## First-Time Setup (Admin Panel)

After logging in at `/admin`:

1. **Settings > Payment Processor** -- Select Stripe/Square/Sola and enter API keys, then click "Test Connection"
2. **Settings > Email (SMTP)** -- Configure SMTP for receipts and expiry notifications
3. **Settings > SIP / Phone** -- Configure FusionPBX for staff call notifications (optional)
4. **Settings > Notifications & Webhooks** -- Set webhook URLs for Home Assistant or other automations
5. **Plans** -- Create your membership plans (monthly, swim pass, single swim)
6. **Members** -- Add members and assign RFID cards

All payment processor credentials, email, and SIP configuration is managed through the admin settings page -- no server restarts needed.

---

## Connecting the Kiosk Hardware

### RFID Reader

Any USB HID RFID reader works (the reader acts as a keyboard -- it types the card UID and presses Enter). Plug it into the kiosk computer's USB port. No drivers needed.

### Kiosk Display

Open `http://<container-ip>/kiosk` in a fullscreen browser (Chrome kiosk mode recommended):

```bash
# Linux kiosk mode example
chromium-browser --kiosk --noerrdialogs --disable-infobars http://<container-ip>/kiosk
```

---

## Common Operations

### View logs

```bash
cd /opt/pool-kiosk
docker compose logs -f           # all services
docker compose logs -f backend   # backend only
```

### Restart services

```bash
docker compose restart
```

### Update to latest version

```bash
cd /opt/pool-kiosk
git pull
docker compose up -d --build
```

### Backup database

```bash
docker compose exec postgres pg_dump -U pool pooldb > backup_$(date +%Y%m%d).sql
```

### Restore database

```bash
cat backup_20260218.sql | docker compose exec -T postgres psql -U pool pooldb
```

### Stop everything

```bash
docker compose down          # stop containers (data preserved)
docker compose down -v       # stop AND delete database volume (destructive!)
```

---

## Project Structure

```
pool-kiosk/
├── docker-compose.yml          # Container orchestration
├── .env.example                # Environment variable template
├── backend/                    # FastAPI + SQLAlchemy backend
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/                # Database migrations
│   └── app/
│       ├── main.py             # App entry point + scheduled jobs
│       ├── models/             # SQLAlchemy ORM models (13 models)
│       ├── schemas/            # Pydantic request/response schemas
│       ├── routers/            # API route handlers (11 routers)
│       ├── services/           # Business logic layer
│       └── payments/           # Payment adapters (stub, cash, stripe, square, sola)
├── frontend/                   # React + Tailwind + Vite
│   ├── Dockerfile
│   └── src/
│       ├── kiosk/              # Kiosk UI (17 screens, 7 components)
│       ├── admin/              # Admin panel (10 pages, layout)
│       ├── shared/             # Shared components (12)
│       ├── api/                # API client modules (9)
│       └── context/            # Auth + Theme providers
├── nginx/                      # Reverse proxy config
└── docs/
    ├── DESIGN.md               # Complete system design document
    └── STATUS.md               # Development progress tracker
```

## Documentation

- **[DESIGN.md](docs/DESIGN.md)** -- Full system architecture, database schema, API endpoints, screen flows, webhook payloads
- **[STATUS.md](docs/STATUS.md)** -- Development status and implementation notes
