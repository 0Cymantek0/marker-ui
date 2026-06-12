# Using Local Absolute Paths

For self-hosted developers or users running Marker UI on the same machine as their documents, you can specify local absolute file paths instead of uploading files through the web browser.

---

## Why Use Local Paths?

- **Zero Upload Latency**: No waiting for multi-gigabyte PDFs to upload via HTTP requests.
- **Direct Engine Hook**: The backend reads the file directly from the specified path, optimizing system throughput.
- **Automation Ready**: Allows integration with local scripts or file watchers that drop paths into the database.

---

## How to Use

1. Navigate to the **Convert** page.
2. Under the **File Upload** area, look for the **Local Absolute Paths** input field.
3. Paste the absolute path to your file:
   - **Windows**: `C:/Users/username/Documents/research-paper.pdf`
   - **Linux/macOS**: `/home/username/documents/research-paper.pdf`
4. Choose your conversion options and click **Convert**.

---

## Important Security Warning

> [!WARNING]
> - Since this feature allows the backend to read arbitrary files from the server's filesystem, it should **only** be exposed in single-user or local-network (LAN) environments.
> - Ensure your server process has the appropriate filesystem read permissions for the target directories.
> - **Windows Path Formatting**: Use forward slashes `/` or double backslashes `\\` as single backslashes can cause escaping issues:
>   - **Correct**: `C:/path/to/doc.pdf`
>   - **Correct**: `C:\\path\\to\\doc.pdf`
>   - **Incorrect**: `C:\path\to\doc.pdf`
