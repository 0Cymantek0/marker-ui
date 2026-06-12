# LLM Providers Configuration

Marker UI can use external or local Large Language Models to refine Markdown layouts, fix OCR slips, and structure tables.

---

## Supported Services & Setup

You can configure your preferred LLM provider on the **Settings** page:

### 1. OpenAI
- **Keys Required**: OpenAI API Key (`sk-...`).
- **Default Model**: `gpt-4o`.
- **Custom Model**: Can be overridden with any standard chat model name (e.g. `gpt-4o-mini`).

### 2. Google Gemini
- **Keys Required**: Gemini API Key.
- **Default Model**: `gemini-1.5-pro`.
- **Custom Model**: E.g. `gemini-1.5-flash` or `gemini-2.0-flash-exp`.

### 3. Anthropic Claude
- **Keys Required**: Anthropic API Key.
- **Default Model**: `claude-3-5-sonnet-latest`.
- **Custom Model**: E.g. `claude-3-5-haiku-latest`.

### 4. Ollama (Local)
- **Base URL**: The local port address where Ollama is running (typically `http://127.0.0.1:11434` or `http://host.docker.internal:11434` if running inside Docker).
- **Default Model**: `llama3`.
- **Custom Model**: E.g. `mistral`, `gemma2`, or your own custom local models.

### 5. Azure OpenAI
- **Credentials Required**: Azure API Key, Azure Endpoint, and Azure Deployment Name.

### 6. Vertex AI
- **Credentials Required**: Google Cloud Project ID, Location (e.g. `us-central1`), and Service Account Credentials JSON path.

---

## Local Encryption

When you enter an API Key in the UI:
1. The frontend posts the key to `/api/settings`.
2. The backend generates a Fernet symmetric key (saved to `data/.secret_key`) on first run if not already present.
3. The API Key is encrypted using this Fernet key and persisted in the SQLite database.
4. When displayed back to you, the key is masked as `sk-proj-****abcd` to avoid accidental exposure.
