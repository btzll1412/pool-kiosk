"""One-time repair: convert saved cards stored as USAePay payment-method keys into chargeable card tokens.

Background (2026-11-05): the admin "add card by number" form used the USAePay /customers API, which
returns a 17-char payment-method key. Charging that key as a card number fails with
"card number must be between 13 and 16 digits". Such a card can still be charged with USAePay's
``customer:sale`` command if we also know the customer key, which was never stored but was written
to the backend log on every save::

    ... USAePay card stored via customer API: member=<uuid>, last4=<4>, customer=<custkey>

Usage (inside the backend container)::

    python -m app.scripts.repair_card_tokens            # dry run: show the plan, touch nothing
    python -m app.scripts.repair_card_tokens --apply    # perform the conversions

No USAePay calls are made; the token is rewritten to ``cust:<custkey>:<pmkey>`` (see
``UsaepayPaymentAdapter.make_customer_token``) and ``charge_saved_card`` does the rest.
"""
from __future__ import annotations

import argparse
import glob
import logging
import os
import re
import sys

from app.database import SessionLocal
from app.models.member import Member
from app.models.saved_card import SavedCard
from app.payments.usaepay_adapter import UsaepayPaymentAdapter
from app.services.activity_service import log_activity
from app.services.payment_service import get_payment_adapter

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("app.scripts.repair_card_tokens")

LOG_LINE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*card stored via customer API: "
    r"member=(?P<member>[0-9a-f-]{36}), last4=(?P<last4>\d{4}), customer=(?P<cust>[a-z0-9]+)"
)


def customer_keys_from_logs(log_dir: str) -> dict[tuple[str, str], list[tuple[str, str]]]:
    """{(member_id, last4): [(timestamp, customer_key), ...]} from every rotated log file."""
    found: dict[tuple[str, str], list[tuple[str, str]]] = {}
    for path in sorted(glob.glob(os.path.join(log_dir, "pool-kiosk.log*"))):
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                m = LOG_LINE.match(line)
                if m:
                    found.setdefault((m["member"], m["last4"]), []).append((m["ts"], m["cust"]))
    for v in found.values():
        v.sort()
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="perform the conversions (default: dry run)")
    ap.add_argument("--log-dir", default=os.environ.get("LOG_DIR", "/app/logs"))
    args = ap.parse_args()

    db = SessionLocal()
    try:
        adapter = get_payment_adapter(db)
        if not isinstance(adapter, UsaepayPaymentAdapter):
            logger.error("Active processor is %s, not USAePay — nothing to do", type(adapter).__name__)
            return 2
        keys = customer_keys_from_logs(args.log_dir)
        bad = [c for c in db.query(SavedCard).all() if UsaepayPaymentAdapter.is_payment_method_key(c.processor_token)]
        already = sum(1 for c in db.query(SavedCard).all() if UsaepayPaymentAdapter.parse_customer_token(c.processor_token))
        logger.info("[REPAIR] already_customer_tokens=%d", already)
        logger.info("[REPAIR] saved_cards=%d payment_method_key_cards=%d log_matches=%d mode=%s",
                    db.query(SavedCard).count(), len(bad), len(keys), "APPLY" if args.apply else "DRY-RUN")
        ok = skipped = failed = 0
        for card in bad:
            member = db.query(Member).filter(Member.id == card.member_id).first()
            who = f"{member.first_name} {member.last_name}" if member else str(card.member_id)
            hits = keys.get((str(card.member_id), card.card_last4), [])
            if not hits:
                logger.warning("[REPAIR] SKIP card=%s member=%s last4=%s reason=no_customer_key_in_logs", card.id, who, card.card_last4)
                skipped += 1
                continue
            ts, cust = hits[-1]  # latest save for this member+last4 is the row that survived
            logger.info("[REPAIR] PLAN card=%s member=%s last4=%s pmkey=%s… customer=%s (logged %s)",
                        card.id, who, card.card_last4, card.processor_token[:4], cust, ts)
            if not args.apply:
                continue
            old = card.processor_token
            card.processor_token = UsaepayPaymentAdapter.make_customer_token(cust, old)
            log_activity(
                db, None, "saved_card.token_repaired", "saved_card", card.id,
                before={"token_format": "payment_method_key", "token_prefix": old[:4]},
                after={"token_format": "customer_token", "customer_key": cust, "pmkey_prefix": old[:4]},
                note="Attached USAePay customer key so the card charges via customer:sale (repair_card_tokens)",
            )
            db.commit()
            logger.info("[REPAIR] OK card=%s member=%s last4=%s token=cust:%s:%s…", card.id, who, card.card_last4, cust, old[:4])
            ok += 1
        logger.info("[REPAIR] DONE converted=%d failed=%d skipped=%d remaining_bad=%d", ok, failed, skipped,
                    sum(1 for c in db.query(SavedCard).all() if UsaepayPaymentAdapter.is_payment_method_key(c.processor_token)))
        return 0 if failed == 0 else 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
