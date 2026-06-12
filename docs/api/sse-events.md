# SSE Stream Events API

Endpoint route prefix: `/api/convert/events`

Marker UI streams progress, terminal console lines, and status milestones from the task manager using Server-Sent Events (SSE) (W3C standard over standard HTTP).

---

## 1. Subscribe to Job Events

`GET /api/convert/events/{job_id}`

Establishes a persistent, one-way HTTP connection to stream events for the specified `job_id`.

### Event Headers
- **`Content-Type`**: `text/event-stream`
- **`Cache-Control`**: `no-cache`
- **`Connection`**: `keep-alive`

---

## 2. Event Messages Structure

The stream emits data blocks prefixed by `data: ` containing serialized JSON.

### Progress Event
Fires when the overall task progress changes.
```text
data: {"event": "progress", "progress": 45, "eta_seconds": 12}
```

### Log Event
Fires when the converter subprocess prints lines to stdout/stderr.
```text
data: {"event": "log", "line": "Loading Layout Segmentation model weights..."}
```

### Completed Event
Fires when the conversion is finished.
```text
data: {"event": "completed", "output_length": 14032}
```

### Failed Event
Fires if the subprocess fails or encounters a filesystem issue.
```text
data: {"event": "failed", "error": "CUDA Out of Memory: failed allocating 4.0GB"}
```

---

## 3. Client Implementation (Javascript Example)

```javascript
const jobId = "8f2b1d60-705a-4e2e-a342-e19ef09bf3cd";
const eventSource = new EventSource(`/api/convert/events/${jobId}`);

eventSource.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  
  if (payload.event === "progress") {
    updateProgressBar(payload.progress);
  } else if (payload.event === "log") {
    appendTerminalLine(payload.line);
  } else if (payload.event === "completed") {
    showDownloadButton(jobId);
    eventSource.close();
  } else if (payload.event === "failed") {
    showErrorNotification(payload.error);
    eventSource.close();
  }
};

eventSource.onerror = (err) => {
  console.error("SSE Connection failed:", err);
  eventSource.close();
};
```
