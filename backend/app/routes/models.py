from fastapi import APIRouter
from app.services.model_tracker import tracker, trigger_retry

router = APIRouter(prefix="/api/models", tags=["models"])

@router.get("/status")
async def get_models_status():
    """Get the current download and initialization status of all models."""
    return tracker.get_status_dict()

@router.post("/cancel")
async def cancel_models_download():
    """Cancel the active model downloads."""
    tracker.request_cancel()
    return {"status": "cancellation_requested"}

@router.post("/retry")
async def retry_models_download():
    """Reset the download tracker and retry loading/downloading the models."""
    trigger_retry()
    return {"status": "retry_initiated"}
