# History & Storage Management

All conversion jobs executed in Marker UI are persisted locally. This guide details how job history is managed, stored, and purged.

---

## Job Persistence

When a conversion job runs:
- **Database Entry**: A record is created in the SQLite database (`data/marker_ui.db`) containing:
  - Unique `job_id`.
  - Input file name, format, and conversion options.
  - Job status (`pending`, `processing`, `completed`, `failed`).
  - Progress percentage and timestamps.
- **Output Files**: Converted files are stored in the server's output directory (`data/output/{job_id}/`).

---

## Using the History Dashboard

Navigate to the **History** page:
- **Pagination**: View past conversions in a paginated list.
- **Status Indicators**: Instantly spot successful, running, or failed jobs.
- **Action Buttons**:
  - **Download**: Fetches the output. If the conversion extracted images, it returns a `.zip` archive containing the Markdown file and the associated images folder. If no images are present, it returns the raw output file (e.g. `.md`, `.json`, or `.html`).
  - **Delete**: Permanently removes the job record from SQLite and deletes the corresponding files from `data/output/{job_id}/`.

---

## Cleaning Storage

Document conversions can accumulate large volumes of text and extracted assets over time.

To free up disk space:
1. Navigate to the **Settings** page.
2. Under **Database Management**, you will see options to:
   - **Purge History**: Delete database records and local output files older than a specified duration.
   - **Reset System**: Wipe all conversion history and database contents (excluding encrypted settings credentials).
