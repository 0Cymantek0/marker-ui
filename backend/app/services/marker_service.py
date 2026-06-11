"""Service wrapping marker-pdf converters.

Uses marker's ConfigParser API for proper option handling,
renderer selection, and LLM service instantiation.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_CONVERTERS: dict[str, type] | None = None


def _import_marker() -> None:
    global _CONVERTERS
    if _CONVERTERS is not None:
        return

    from marker.converters.pdf import PdfConverter
    from marker.converters.table import TableConverter
    from marker.converters.ocr import OCRConverter
    from marker.converters.extraction import ExtractionConverter

    _CONVERTERS = {
        "PdfConverter": PdfConverter,
        "TableConverter": TableConverter,
        "OCRConverter": OCRConverter,
        "ExtractionConverter": ExtractionConverter,
    }
    logger.info("marker-pdf converters imported: %s", list(_CONVERTERS.keys()))


LLM_SERVICE_MAP: dict[str, str] = {
    "gemini": "marker.services.gemini.GoogleGeminiService",
    "openai": "marker.services.openai.OpenAIService",
    "claude": "marker.services.claude.ClaudeService",
    "ollama": "marker.services.ollama.OllamaService",
    "azure": "marker.services.azure_openai.AzureOpenAIService",
    "vertex": "marker.services.vertex.GoogleVertexService",
}


def build_marker_options(
    llm_config: dict[str, Any],
    conversion_config: dict[str, Any],
) -> dict[str, Any]:
    """Build the options dict that ConfigParser expects.

    This dict uses marker's CLI-style key names. ConfigParser will
    convert them into the proper nested config structure.
    """
    options: dict[str, Any] = {}

    service = llm_config.get("llm_service", "no_llm")
    if service and service != "no_llm":
        options["use_llm"] = True

        if llm_config.get("timeout"):
            options["timeout"] = llm_config["timeout"]
        if llm_config.get("max_retries"):
            options["max_retries"] = llm_config["max_retries"]
        if llm_config.get("retry_wait_time"):
            options["retry_wait_time"] = llm_config["retry_wait_time"]
        if llm_config.get("max_output_tokens"):
            options["max_output_tokens"] = llm_config["max_output_tokens"]

        override_model = conversion_config.get("llm_model")

        if service == "gemini":
            if llm_config.get("gemini_api_key"):
                options["gemini_api_key"] = llm_config["gemini_api_key"]
            model = override_model or llm_config.get("gemini_model_name")
            if model:
                options["gemini_model_name"] = model

        elif service == "openai":
            if llm_config.get("openai_api_key"):
                options["openai_api_key"] = llm_config["openai_api_key"]
            if llm_config.get("openai_base_url"):
                options["openai_base_url"] = llm_config["openai_base_url"]
            model = override_model or llm_config.get("openai_model")
            if model:
                options["openai_model"] = model

        elif service == "claude":
            if llm_config.get("claude_api_key"):
                options["claude_api_key"] = llm_config["claude_api_key"]
            model = override_model or llm_config.get("claude_model_name")
            if model:
                options["claude_model_name"] = model

        elif service == "ollama":
            if llm_config.get("ollama_base_url"):
                options["ollama_base_url"] = llm_config["ollama_base_url"]
            model = override_model or llm_config.get("ollama_model")
            if model:
                options["ollama_model"] = model

        elif service == "azure":
            if llm_config.get("azure_endpoint"):
                options["azure_endpoint"] = llm_config["azure_endpoint"]
            if llm_config.get("azure_api_key"):
                options["azure_api_key"] = llm_config["azure_api_key"]
            if llm_config.get("azure_api_version"):
                options["azure_api_version"] = llm_config["azure_api_version"]
            model = override_model or llm_config.get("azure_deployment_name")
            if model:
                options["deployment_name"] = model

        elif service == "vertex":
            if llm_config.get("vertex_project_id"):
                options["vertex_project_id"] = llm_config["vertex_project_id"]
            if llm_config.get("vertex_location"):
                options["vertex_location"] = llm_config["vertex_location"]
            model = override_model or llm_config.get("gemini_model_name")
            if model:
                options["gemini_model_name"] = model

    options.update(conversion_config)
    return options


import threading
from app.services.model_tracker import tracker

class MarkerService:
    """Manages marker-pdf model loading and document conversion."""

    def __init__(self) -> None:
        self._model_dict: dict[str, Any] | None = None
        self._initialized = False
        self._lock = threading.Lock()

    def initialize(self) -> None:
        with self._lock:
            if self._initialized:
                return

            tracker.set_loading(True)
            t0 = time.perf_counter()
            _import_marker()

            from marker.models import create_model_dict

            logger.info("Loading marker model dict ...")
            self._model_dict = create_model_dict()
            elapsed = time.perf_counter() - t0
            logger.info("Marker models loaded in %.1f s", elapsed)
            self._initialized = True
            tracker.set_initialized(True)

    def convert_file(
        self,
        filepath: str | Path,
        options: dict[str, Any],
    ) -> dict[str, Any]:
        self.initialize()

        from marker.config.parser import ConfigParser
        from marker.output import text_from_rendered

        converter_cls_name = options.pop("converter_cls", "PdfConverter")
        converter_cls = (_CONVERTERS or {}).get(
            converter_cls_name,
            (_CONVERTERS or {})["PdfConverter"],
        )

        config_parser = ConfigParser(options)
        config_dict = config_parser.generate_config_dict()

        converter = converter_cls(
            config=config_dict,
            artifact_dict=self._model_dict,
            processor_list=config_parser.get_processors(),
            renderer=config_parser.get_renderer(),
            llm_service=config_parser.get_llm_service(),
        )

        rendered = converter(str(filepath))
        text, ext, images = text_from_rendered(rendered)

        return {
            "text": text,
            "extension": ext,
            "images": images,
            "metadata": getattr(rendered, "metadata", None),
        }

    def convert_bytes(
        self,
        data: bytes,
        filename: str,
        options: dict[str, Any],
    ) -> dict[str, Any]:
        from app.core.config import UPLOAD_DIR
        tmp_dir = UPLOAD_DIR
        tmp_dir.mkdir(parents=True, exist_ok=True)
        tmp_path = tmp_dir / filename
        tmp_path.write_bytes(data)
        try:
            return self.convert_file(tmp_path, dict(options))
        finally:
            tmp_path.unlink(missing_ok=True)

    @staticmethod
    def get_defaults() -> dict[str, Any]:
        _import_marker()
        try:
            from marker.config.parser import ConfigParser
            cp = ConfigParser({})
            return {k: v for k, v in cp.dict_config.items()}
        except Exception:
            return {}
