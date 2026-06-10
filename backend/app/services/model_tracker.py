import logging
import os
import time
import threading
from pathlib import Path
from typing import Any, Dict, Optional
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
