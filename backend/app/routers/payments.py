import logging

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/adapters")
def list_adapters():
    return {"available": ["stub", "cash"], "note": "Configure via PAYMENT_ADAPTER env var"}
