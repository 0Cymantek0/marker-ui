# Troubleshooting Common Issues

This guide lists common errors you might encounter while installing, configuring, or running Marker UI, along with steps to resolve them.

---

## 1. Stuck on the Onboarding Page (Model Downloads)

### Symptom
The page shows a download progress indicator but the speed drops to zero or gets stuck indefinitely.

### Mitigation
- Check your internet connection. The deep learning model weights exceed **2 GB** in size.
- Ensure your disk has at least **10 GB** of free space.
- Inspect the backend terminal logs or docker logs to see if Hugging Face or PyTorch is raising download timeouts.
- **Local Network Proxy**: If behind a company proxy, ensure your command prompt has environment variables like `HTTP_PROXY` and `HTTPS_PROXY` set correctly.

---

## 2. White Screen After Launching Docker Compose

### Symptom
Navigating to `http://localhost:3000` shows a blank white page.

### Mitigation
- Open your browser's Developer Tools Console (F12) to see if there are any connection failures.
- Ensure the container is fully running by checking `docker compose ps`.
- Check container logs using `docker compose logs marker-ui` to verify that the Nginx server and FastAPI backend both initialized successfully on startup.

---

## 3. CUDA/GPU Acceleration Not Detected

### Symptom
In settings or console logs, the app reports running on `cpu` rather than CUDA, making conversions slow.

### Mitigation
- **For Source Installations**:
  - Run `nvidia-smi` in terminal to confirm your graphics driver is installed and active.
  - Verify that PyTorch is compiled with CUDA support by running:
    ```bash
    python -c "import torch; print(torch.cuda.is_available())"
    ```
  - If it prints `False`, reinstall PyTorch with the correct CUDA version matching your graphics drivers (e.g. `pip install torch --index-url https://download.pytorch.org/whl/cu121`).
- **For Docker Deployments**:
  - Ensure the **NVIDIA Container Toolkit** is installed on the host.
  - Add the GPU reservation block to the service in `docker-compose.yml` to allow the container to access your GPU hardware.

---

## 4. Local Path Conversion Fails with Permission Denied

### Symptom
When submitting a local absolute file path, the console throws a `Permission Denied` error or fails to find the file.

### Mitigation
- Ensure the server process (or the docker container) has read privileges for the target folder.
- If using Docker, the host directory containing the files **must** be mounted into the container as a volume.
- Use forward slashes `/` for Windows paths in the input field to prevent escape characters.
