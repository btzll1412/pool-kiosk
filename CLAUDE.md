# Pool Management System — Claude Instructions

## First Thing Every Session

**Before writing any code, ALWAYS read these files:**

1. `docs/DESIGN.md` — The complete system design document (architecture, schema, endpoints, flows)
2. `docs/STATUS.md` — Current development progress and what's been built so far

These are the source of truth for this project. Do not guess or assume — read them.

---

## Project Standards

### Code Quality

- This project must look and feel **professional-grade** at every level
- Write clean, well-structured, production-quality code
- Follow established patterns already in the codebase — consistency matters
- Use proper error handling, input validation, and type safety throughout
- No shortcuts, no placeholder hacks left behind, no "TODO: fix later" without a tracked issue

### Backend (Python / FastAPI)

- Type hints on all functions
- Pydantic schemas for all request/response bodies
- Business logic lives in `services/`, not in route handlers
- Route handlers should be thin — validate, call service, return response
- Use SQLAlchemy models with proper relationships and constraints
- Alembic for all schema changes — never modify the database manually

### Frontend (React / Tailwind)

- Functional components with hooks
- Consistent Tailwind styling — no inline styles, no CSS files
- API calls go through the `api/` client layer, not directly in components
- Kiosk UI must be touch-optimized with large tap targets
- Admin UI must be clean, responsive, and data-dense where appropriate

### Documentation

- **CRITICAL:** After completing any feature, update `docs/DESIGN.md` if the implementation differs from the original plan
- **CRITICAL:** After completing any feature, update `docs/STATUS.md` with what was built and what's next
- These documents must always reflect the real, current state of the project

---

## Git Workflow

- Develop on branch: `claude/pool-management-system-gxRaW`
- Write clear, descriptive commit messages
- Commit logically grouped changes — not everything in one giant commit

---

## Architecture Reminders

- **Payment adapters** use the modular pattern in `app/payments/` — all processors implement the base interface
- **System settings** are stored in the database `settings` table, not hardcoded
- **Activity logging** must cover all admin actions — before/after snapshots
- **Kiosk endpoints** are unauthenticated but rate-limited
- **Admin endpoints** require JWT authentication
