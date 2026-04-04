# ---- Stage 1: dependency builder ----
FROM python:3.12-slim AS builder
WORKDIR /app
COPY scripts/requirements.txt ./requirements.txt
# Install Python deps to /install prefix so runtime stage can COPY them cleanly
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt
# Install Playwright separately WITHOUT --prefix — browser binary must land at /root/.cache/ms-playwright
RUN pip install --no-cache-dir playwright \
    && playwright install --with-deps chromium

# ---- Stage 2: runtime ----
FROM python:3.12-slim AS runtime

# System deps: Xvfb (virtual display), x11vnc (VNC stream), Node.js 18 (notebooklm-py internals)
RUN apt-get update && apt-get install -y \
    curl gnupg ca-certificates \
    xvfb x11vnc \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy Python packages from builder stage
COPY --from=builder /install /usr/local

# Copy Playwright Chromium browser binary from builder stage
COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright

# Playwright needs its own pip install in runtime to register the CLI and API
RUN pip install --no-cache-dir playwright \
    && playwright install-deps chromium

WORKDIR /app
COPY scripts/ ./scripts/
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Cloud Run injects PORT env var; always 8080 in practice
EXPOSE 8080

# ENTRYPOINT with exec form — uvicorn receives SIGTERM directly, not via bash
ENTRYPOINT ["./entrypoint.sh"]
