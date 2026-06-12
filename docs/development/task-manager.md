# Task Manager & Queue Semantics

Since document conversions involve CPU-intensive processes, they cannot run within the FastAPI main event loop. Marker UI uses a custom asynchronous queue manager to execute jobs sequentially in the background.

---

## Process Flow

1. **Queueing**: When a user uploads a document, the route creates a database record with `status="pending"` and places the job metadata into the `TaskManager` in-memory queue.
2. **Subprocess Thread Pool**:
   - The task manager runs a dedicated loop checking for pending jobs.
   - When a job is pulled, the manager spawns a Python subprocess executing `marker_single` (the command-line conversion utility).
3. **Log Interception**:
   - The task manager hooks into the subprocess's `stdout` and `stderr` streams.
   - Every line printed by the CLI is captured, appended to the job's database logs, and pushed to active SSE subscribers.
4. **Completion**:
   - Once the subprocess exits, the task manager reads the exit code.
   - If the code is `0`, the status is updated to `completed` and the database updates.
   - If non-zero, the status updates to `failed` and the error logs are persisted.
