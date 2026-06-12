# Changelog

All notable changes to the Marker UI project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-06-12
### Added
- Real-time model weight download console showing network speeds and stages.
- LLM model override options configuration.
- Local Fernet credential encryption and key masking in JSON API responses.
- Database purge settings page actions.
- Multi-format conversion status tracking with SSE (Server-Sent Events).

### Changed
- Refactored project documentation into modular documents inside `docs/` hierarchy.
- Replaced single-file landing pages with task-driven setup and architecture guides.

## [0.1.0] - 2026-06-05
### Added
- Initial release of Marker UI with FastAPI backend and Vite frontend.
- SQLite job history persistence.
- Docker Compose dev environment configurations.
