import logging
import os
import time
import threading
from pathlib import Path
from typing import Any, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
import requests

logger = logging.getLogger(__name__)

MODEL_NAMES = {
    "layout": "Layout Detection",
    "text_recognition": "Text Recognition",
    "text_detection": "Text Detection",
    "table_recognition": "Table Structure Recognition",
    "ocr_error_detection": "OCR Error Correction",
}

class ModelTracker:
    """Thread-safe tracker for monitoring AI model download progress."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._initialized = False
        self._loading = False
        self._cancel_requested = False
        self._error: Optional[str] = None
        self._start_time: Optional[float] = None
        self._session_downloaded_bytes = 0

        # Initialize models dict
        self._models: Dict[str, Dict[str, Any]] = {}
        for key, name in MODEL_NAMES.items():
            self._models[key] = {
                "name": name,
                "status": "pending",
                "downloaded_bytes": 0,
                "total_bytes": 0,
                "progress": 0.0,
                "files": {}
            }

    def reset(self) -> None:
        with self._lock:
            self._initialized = False
            self._loading = False
            self._cancel_requested = False
            self._error = None
            self._start_time = None
            self._session_downloaded_bytes = 0
            for key in self._models:
                self._models[key] = {
                    "name": MODEL_NAMES[key],
                    "status": "pending",
                    "downloaded_bytes": 0,
                    "total_bytes": 0,
                    "progress": 0.0,
                    "files": {}
                }

    @property
    def cancel_requested(self) -> bool:
        with self._lock:
            return self._cancel_requested

    def request_cancel(self) -> None:
        with self._lock:
            self._cancel_requested = True
            self._loading = False
            # Mark all downloading models as failed
            for key in self._models:
                if self._models[key]["status"] in ("pending", "downloading"):
                    self._models[key]["status"] = "failed"

    def set_initialized(self, val: bool) -> None:
        with self._lock:
            self._initialized = val
            self._loading = False
            if val:
                self._error = None
                self._cancel_requested = False
                # Ensure all models are completed
                for key in self._models:
                    self._models[key]["status"] = "completed"
                    self._models[key]["progress"] = 100.0

    def set_loading(self, val: bool) -> None:
        with self._lock:
            self._loading = val

    def set_failed(self, error_msg: str) -> None:
        with self._lock:
            self._error = error_msg
            self._loading = False
            for key in self._models:
                if self._models[key]["status"] == "downloading":
                    self._models[key]["status"] = "failed"

    def set_cancelled(self) -> None:
        with self._lock:
            self._error = "Download cancelled by user"
            self._loading = False

    def start_model_download(self, model_key: str) -> None:
        with self._lock:
            if model_key in self._models:
                self._models[model_key]["status"] = "downloading"
                if self._start_time is None:
                    self._start_time = time.time()

    def complete_model_download(self, model_key: str) -> None:
        with self._lock:
            if model_key in self._models:
                self._models[model_key]["status"] = "completed"
                self._models[model_key]["progress"] = 100.0
                # If total bytes wasn't set, set it to downloaded bytes
                if self._models[model_key]["total_bytes"] == 0:
                    self._models[model_key]["total_bytes"] = self._models[model_key]["downloaded_bytes"]

    def fail_model_download(self, model_key: str, error_msg: str) -> None:
        with self._lock:
            if model_key in self._models:
                self._models[model_key]["status"] = "failed"
                self._error = error_msg

    def start_file_download(self, model_key: str, filename: str) -> None:
        with self._lock:
            if model_key in self._models:
                self._models[model_key]["files"][filename] = {
                    "status": "downloading",
                    "downloaded_bytes": 0,
                    "total_bytes": 0
                }

    def set_file_total_size(self, model_key: str, filename: str, total_size: int) -> None:
        with self._lock:
            if model_key in self._models and filename in self._models[model_key]["files"]:
                file_info = self._models[model_key]["files"][filename]
                old_total = file_info["total_bytes"]
                file_info["total_bytes"] = total_size
                # Update model total size
                self._models[model_key]["total_bytes"] += (total_size - old_total)

    def update_file_progress(self, model_key: str, filename: str, chunk_len: int) -> None:
        with self._lock:
            if self._start_time is None:
                self._start_time = time.time()
            self._session_downloaded_bytes += chunk_len

            if model_key in self._models:
                self._models[model_key]["downloaded_bytes"] += chunk_len
                if filename in self._models[model_key]["files"]:
                    self._models[model_key]["files"][filename]["downloaded_bytes"] += chunk_len

                # Update progress percentage
                total = self._models[model_key]["total_bytes"]
                downloaded = self._models[model_key]["downloaded_bytes"]
                if total > 0:
                    self._models[model_key]["progress"] = min(100.0, round((downloaded / total) * 100.0, 1))

    def complete_file_download(self, model_key: str, filename: str) -> None:
        with self._lock:
            if model_key in self._models and filename in self._models[model_key]["files"]:
                file_info = self._models[model_key]["files"][filename]
                file_info["status"] = "completed"
                # Align bytes
                diff = file_info["total_bytes"] - file_info["downloaded_bytes"]
                if diff > 0:
                    self._models[model_key]["downloaded_bytes"] += diff
                    self._session_downloaded_bytes += diff
                    file_info["downloaded_bytes"] = file_info["total_bytes"]

                total = self._models[model_key]["total_bytes"]
                downloaded = self._models[model_key]["downloaded_bytes"]
                if total > 0:
                    self._models[model_key]["progress"] = min(100.0, round((downloaded / total) * 100.0, 1))

    def fail_file_download(self, model_key: str, filename: str, error_msg: str) -> None:
        with self._lock:
            if model_key in self._models and filename in self._models[model_key]["files"]:
                self._models[model_key]["files"][filename]["status"] = "failed"
                self._models[model_key]["status"] = "failed"
                self._error = error_msg

    def get_status_dict(self) -> Dict[str, Any]:
        with self._lock:
            # Calculate overall metrics
            total_bytes = 0
            downloaded_bytes = 0
            downloading_models = 0
            completed_models = 0
            any_downloading = False

            for key, m in self._models.items():
                total_bytes += m["total_bytes"]
                downloaded_bytes += m["downloaded_bytes"]
                if m["status"] == "downloading":
                    any_downloading = True
                    downloading_models += 1
                elif m["status"] == "completed":
                    completed_models += 1

            progress = 0.0
            if total_bytes > 0:
                progress = min(100.0, round((downloaded_bytes / total_bytes) * 100.0, 1))
            elif completed_models == len(self._models):
                progress = 100.0

            # Calculate speed and ETA
            speed = 0.0
            eta = 0.0
            if any_downloading and self._start_time is not None:
                elapsed = time.time() - self._start_time
                if elapsed > 0.1 and self._session_downloaded_bytes > 0:
                    speed = self._session_downloaded_bytes / elapsed  # bytes / sec
                    remaining_bytes = max(0, total_bytes - downloaded_bytes)
                    eta = remaining_bytes / speed

            # Overall status string
            if self._initialized:
                overall_status = "completed"
            elif self._error:
                overall_status = "failed"
            elif self._loading:
                overall_status = "loading"
            elif any_downloading:
                overall_status = "downloading"
            else:
                overall_status = "pending"

            return {
                "initialized": self._initialized,
                "loading": self._loading,
                "cancel_requested": self._cancel_requested,
                "error": self._error,
                "models": self._models,
                "overall": {
                    "status": overall_status,
                    "progress": progress,
                    "downloaded_bytes": downloaded_bytes,
                    "total_bytes": total_bytes,
                    "speed": round(speed / (1024 * 1024), 2),  # Convert to MB/s
                    "eta": int(eta)
                }
            }

tracker = ModelTracker()

def get_model_key_from_url(url: str) -> str:
    parsed = url
    for prefix in ["https://models.datalab.to/", "http://models.datalab.to/", "s3://"]:
        if parsed.startswith(prefix):
            parsed = parsed[len(prefix):]
            break
    parts = parsed.split("/")
    if len(parts) > 0:
        model_key = parts[0]
        # Normalize table_rec to table_recognition if needed
        if model_key == "table_rec" or model_key == "table_recognition":
            return "table_recognition"
        if model_key in MODEL_NAMES:
            return model_key
    return "unknown"

def setup_monkeypatch() -> None:
    """Applies monkeypatches to surya.common.s3 download helpers."""
    try:
        import surya.common.s3 as surya_s3
    except ImportError:
        logger.warning("surya package not installed yet, skipping download monkeypatch.")
        return

    original_download_file = surya_s3.download_file
    original_download_directory = surya_s3.download_directory

    def custom_download_file(remote_path: str, local_path: str, chunk_size: int = 1024 * 1024):
        if tracker.cancel_requested:
            raise ValueError("Download cancelled by user")

        local_path_obj = Path(local_path)
        filename = local_path_obj.name
        model_key = get_model_key_from_url(remote_path)

        if filename == "manifest.json":
            try:
                response = requests.get(remote_path, stream=True, allow_redirects=True)
                response.raise_for_status()
                with open(local_path_obj, "wb") as f:
                    for chunk in response.iter_content(chunk_size=chunk_size):
                        if tracker.cancel_requested:
                            raise ValueError("Download cancelled by user")
                        if chunk:
                            f.write(chunk)
                return local_path_obj
            except Exception as e:
                if local_path_obj.exists():
                    local_path_obj.unlink()
                raise e

        # Non-manifest file tracking
        tracker.start_file_download(model_key, filename)
        try:
            response = requests.get(remote_path, stream=True, allow_redirects=True)
            response.raise_for_status()

            total_size = int(response.headers.get('content-length', 0))
            tracker.set_file_total_size(model_key, filename, total_size)

            with open(local_path_obj, "wb") as f:
                for chunk in response.iter_content(chunk_size=chunk_size):
                    if tracker.cancel_requested:
                        raise ValueError("Download cancelled by user")
                    if chunk:
                        f.write(chunk)
                        tracker.update_file_progress(model_key, filename, len(chunk))

            tracker.complete_file_download(model_key, filename)
            return local_path_obj
        except Exception as e:
            if local_path_obj.exists():
                local_path_obj.unlink()
            tracker.fail_file_download(model_key, filename, str(e))
            logger.error(f"Download error for file {remote_path}: {str(e)}")
            raise e

    def custom_download_directory(remote_path: str, local_dir: str):
        if tracker.cancel_requested:
            raise ValueError("Download cancelled by user")

        model_key = get_model_key_from_url(remote_path)
        tracker.start_model_download(model_key)

        try:
            # Check manifest first
            if surya_s3.check_manifest(local_dir):
                tracker.complete_model_download(model_key)
                return

            # Proceed with download
            original_download_directory(remote_path, local_dir)
            tracker.complete_model_download(model_key)
        except Exception as e:
            tracker.fail_model_download(model_key, str(e))
            raise e

    surya_s3.download_file = custom_download_file
    surya_s3.download_directory = custom_download_directory
    logger.info("Monkeypatched surya.common.s3 download routines successfully.")


def check_models_downloaded() -> bool:
    """Check if all 5 required models are already downloaded on disk."""
    try:
        from surya.common.s3 import S3DownloaderMixin, check_manifest
        from surya.settings import settings as surya_settings
    except ImportError:
        return False

    checkpoints = [
        surya_settings.LAYOUT_MODEL_CHECKPOINT,
        surya_settings.RECOGNITION_MODEL_CHECKPOINT,
        surya_settings.TABLE_REC_MODEL_CHECKPOINT,
        surya_settings.DETECTOR_MODEL_CHECKPOINT,
        surya_settings.OCR_ERROR_MODEL_CHECKPOINT,
    ]

    for cp in checkpoints:
        local_path = S3DownloaderMixin.get_local_path(cp)
        if not local_path or not check_manifest(local_path):
            return False
    return True

_retry_callback = None

def register_retry_callback(cb) -> None:
    global _retry_callback
    _retry_callback = cb

def trigger_retry() -> None:
    if _retry_callback:
        _retry_callback()


def self_heal_check() -> Dict[str, Any]:
    """Verify integrity of all model checkpoints, clean corrupt files, and re-download."""
    try:
        from surya.common.s3 import S3DownloaderMixin, check_manifest
        from surya.settings import settings as surya_settings
        import shutil
        import json
    except ImportError:
        return {"success": False, "message": "Surya package not installed"}

    checkpoints = {
        "layout": surya_settings.LAYOUT_MODEL_CHECKPOINT,
        "text_recognition": surya_settings.RECOGNITION_MODEL_CHECKPOINT,
        "table_recognition": surya_settings.TABLE_REC_MODEL_CHECKPOINT,
        "text_detection": surya_settings.DETECTOR_MODEL_CHECKPOINT,
        "ocr_error_detection": surya_settings.OCR_ERROR_MODEL_CHECKPOINT,
    }

    healed_count = 0
    issues = []

    # Clear in-memory model dictionary first if any models exist
    try:
        from app.main import _app_state
        with _app_state.marker_service._lock:
            _app_state.marker_service._model_dict = None
            _app_state.marker_service._initialized = False
    except Exception:
        pass

    for key, cp in checkpoints.items():
        local_path = S3DownloaderMixin.get_local_path(cp)
        if not local_path:
            issues.append(f"No path found for {key}")
            continue

        local_path_obj = Path(local_path)
        manifest_path = local_path_obj / "manifest.json"
        
        is_corrupt = False
        reason = ""
        
        if not local_path_obj.exists() or not manifest_path.exists():
            is_corrupt = True
            reason = "Missing manifest or directory"
        else:
            try:
                with open(manifest_path, "r") as f:
                    manifest = json.load(f)
                for file in manifest.get("files", []):
                    f_path = local_path_obj / file
                    if not f_path.exists():
                        is_corrupt = True
                        reason = f"Missing file: {file}"
                        break
                    if f_path.stat().st_size == 0:
                        is_corrupt = True
                        reason = f"Empty file: {file}"
                        break
            except Exception as e:
                is_corrupt = True
                reason = f"Corrupt manifest: {str(e)}"

        if is_corrupt:
            issues.append(f"{key} is corrupt/missing: {reason}")
            if manifest_path.exists():
                try:
                    manifest_path.unlink()
                except Exception:
                    pass
            if local_path_obj.exists():
                try:
                    shutil.rmtree(local_path_obj, ignore_errors=True)
                except Exception:
                    pass
            healed_count += 1

    # Reset tracker status to trigger fresh download/load
    tracker.reset()

    # Restart background loading/downloading
    trigger_retry()

    return {
        "success": True,
        "healed_count": healed_count,
        "issues": issues,
        "message": f"Self-healing complete. Healed {healed_count} model(s)."
    }


async def reset_models_and_data(delete_user_data: bool = False, db_session: Optional[AsyncSession] = None) -> Dict[str, Any]:
    """Delete all downloaded models on disk, and optionally reset settings/history."""
    try:
        from surya.common.s3 import S3DownloaderMixin
        from surya.settings import settings as surya_settings
        import shutil
        import gc
        from sqlalchemy.ext.asyncio import AsyncSession
    except ImportError:
        return {"success": False, "message": "Surya package not installed"}

    checkpoints = [
        surya_settings.LAYOUT_MODEL_CHECKPOINT,
        surya_settings.RECOGNITION_MODEL_CHECKPOINT,
        surya_settings.TABLE_REC_MODEL_CHECKPOINT,
        surya_settings.DETECTOR_MODEL_CHECKPOINT,
        surya_settings.OCR_ERROR_MODEL_CHECKPOINT,
    ]

    # Clear in-memory model cache
    try:
        from app.main import _app_state
        with _app_state.marker_service._lock:
            _app_state.marker_service._model_dict = None
            _app_state.marker_service._initialized = False
    except Exception:
        pass

    # Run garbage collection and free PyTorch cache to unlock files
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass

    deleted_paths = []
    # 1. Delete model directories
    for cp in checkpoints:
        local_path = S3DownloaderMixin.get_local_path(cp)
        if local_path:
            local_path_obj = Path(local_path)
            if local_path_obj.exists():
                # Unlink manifest first (less likely to be locked) to mark it as uninstalled/not present
                manifest_path = local_path_obj / "manifest.json"
                if manifest_path.exists():
                    try:
                        manifest_path.unlink()
                    except Exception as e:
                        logger.error(f"Failed to delete manifest for {cp}: {e}")
                
                try:
                    shutil.rmtree(local_path_obj, ignore_errors=True)
                    deleted_paths.append(str(local_path_obj))
                except Exception as e:
                    logger.warning(f"Failed to delete model path {local_path}: {e}")

    # Reset tracker status
    tracker.reset()

    db_reset = False
    if delete_user_data:
        try:
            from app.database import engine, Base
            from app.core.config import UPLOAD_DIR, OUTPUT_DIR
            from app.core.api_manager import load_secrets_from_db
            from app.routes.settings import init_llm_providers_if_missing
            from app.database import async_session_factory
            from sqlalchemy.ext.asyncio import async_sessionmaker
            
            # Clear uploaded & output files
            if UPLOAD_DIR.exists():
                for item in UPLOAD_DIR.iterdir():
                    try:
                        if item.is_file():
                            item.unlink()
                        elif item.is_dir():
                            shutil.rmtree(item, ignore_errors=True)
                    except Exception as e:
                        logger.warning(f"Failed to delete upload item {item}: {e}")
            if OUTPUT_DIR.exists():
                for item in OUTPUT_DIR.iterdir():
                    try:
                        if item.is_file():
                            item.unlink()
                        elif item.is_dir():
                            shutil.rmtree(item, ignore_errors=True)
                    except Exception as e:
                        logger.warning(f"Failed to delete output item {item}: {e}")

            # Re-create DB tables asynchronously
            bind_engine = db_session.bind if db_session is not None else engine
            async with bind_engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
                await conn.run_sync(Base.metadata.create_all)
                
            # Initialize default settings and providers
            if db_session is not None:
                local_session_factory = async_sessionmaker(bind_engine, class_=AsyncSession, expire_on_commit=False)
            else:
                local_session_factory = async_session_factory

            async with local_session_factory() as session:
                await init_llm_providers_if_missing(session)
            await load_secrets_from_db()
            
            db_reset = True
        except Exception as e:
            logger.error(f"Error resetting database: {e}", exc_info=True)
            db_reset = False

    return {
        "success": True,
        "deleted_models": deleted_paths,
        "user_data_reset": db_reset,
        "message": "System reset completed successfully."
    }
