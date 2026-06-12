# Settings & LLM Configuration API

Endpoint route prefix: `/api/settings`

Provides endpoints to view, update, delete, and test system settings and LLM keys.

---

## 1. Retrieve All Settings

`GET /api/settings/`

Returns all saved settings grouped by category. Sensitive fields are masked in the response.

### Response (`200 OK`)
```json
{
  "general": [
    {
      "key": "theme",
      "value": "dark",
      "category": "general"
    }
  ],
  "llm": [
    {
      "key": "openai_api_key",
      "value": "sk-proj-****abcd",
      "category": "llm"
    }
  ]
}
```

---

## 2. Update a Single Setting

`PUT /api/settings/`

Updates or inserts a single configuration key-value pair. Keys matching sensitive patterns are encrypted in SQLite.

### Request Body
```json
{
  "key": "theme",
  "value": "light",
  "category": "general"
}
```

---

## 3. Configure Active LLM Provider

`GET /api/settings/llm/active`

Returns the currently selected LLM service.

`PUT /api/settings/llm/active`

Sets the active LLM provider (e.g. `openai`, `gemini`, `claude`, `ollama`, etc.).

### Request Body
```json
{
  "provider": "gemini"
}
```

---

## 4. Test LLM Connection

`POST /api/settings/llm/test`

Triggers a brief test prompt to the active LLM provider using the saved credentials to verify the connection works.

### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Connection test successful."
}
```

---

## 5. GPU & Installation Status

`GET /api/settings/gpu/status`

Returns whether PyTorch is running under CPU or CUDA/MPS acceleration.

`POST /api/settings/gpu/install`

Triggers the installer script to attempt downloading PyTorch CUDA wheels if an NVIDIA card is detected.
