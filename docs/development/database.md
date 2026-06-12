# Database Schema & Migrations

Marker UI uses **SQLite** as its storage engine, managed through **SQLAlchemy** (using asynchronous `aiosqlite`) and versioned with **Alembic** migrations.

---

## Schema Models

The database contains two main tables:

### 1. `Job` Model
Tracks document conversions.
- `id`: UUID (Primary Key).
- `filename`: String.
- `status`: String (`pending`, `processing`, `completed`, `failed`).
- `progress`: Integer (0 to 100).
- `error`: Text (nullable).
- `output_length`: Integer (nullable).
- `created_at` / `completed_at`: DateTime.

### 2. `Setting` Model
Stores key-value configurations.
- `key`: String (Primary Key).
- `value`: Text.
- `category`: String (`general`, `llm`, etc.).
- `updated_at`: DateTime.

---

## Migrations (Alembic)

All schema changes must be versioned. If you add fields to database models in `app/models/database.py`:

1. Generate the migration file:
   ```bash
   cd backend
   alembic revision --autogenerate -m "Describe your changes"
   ```
2. Apply the migration locally:
   ```bash
   alembic upgrade head
   ```
3. The database updates are performed automatically when running the Docker container on startup.
