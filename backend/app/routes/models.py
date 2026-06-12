from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
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

@router.post("/self-heal")
async def self_heal_models():
    """Verify file integrity and download missing files/components."""
    from app.services.model_tracker import self_heal_check
    return self_heal_check()

@router.post("/reset")
async def reset_models(delete_user_data: bool = False, db: AsyncSession = Depends(get_db)):
    """Delete all downloaded models, and optionally reset settings/history."""
    from app.services.model_tracker import reset_models_and_data
    return await reset_models_and_data(delete_user_data=delete_user_data, db_session=db)
