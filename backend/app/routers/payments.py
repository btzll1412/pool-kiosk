from fastapi import APIRouter

router = APIRouter()


@router.get("/adapters")
def list_adapters():
    return {"available": ["stub", "cash"], "note": "Configure via PAYMENT_ADAPTER env var"}
