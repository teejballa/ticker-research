#!/usr/bin/env python3
"""
Daytona container server — FastAPI SSE wrapper for notebooklm_research.py.
Receives POST /analyze/{ticker} with sourcePackage + storageState JSON.
Writes per-request temp files, spawns notebooklm_research.py, streams stdout as SSE.
DELETE /vnc-start and GET /vnc-status handled in a later plan (Plan 04).
"""
import asyncio
import json
import os
import tempfile
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

SECRET = os.environ.get("DAYTONA_SECRET", "")

app = FastAPI(title="Ticker Research Container Server")

# Allow the Vercel frontend origin to call this server.
# ALLOWED_ORIGIN env var should be set to the Vercel domain (e.g. https://ticker-research.vercel.app)
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _check_secret(x_daytona_secret: str | None) -> None:
    """Validate shared secret. Raises 401 if missing or wrong."""
    if not SECRET:
        raise HTTPException(status_code=500, detail="DAYTONA_SECRET not configured on container")
    if x_daytona_secret != SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


async def _stream_script(pkg_path: str, storage_path: str) -> AsyncGenerator[str, None]:
    """Run notebooklm_research.py and yield each stdout line as an SSE data: line."""
    script = os.path.join(os.path.dirname(__file__), "notebooklm_research.py")
    env = {**os.environ, "NOTEBOOKLM_AUTH_JSON": storage_path}
    proc = await asyncio.create_subprocess_exec(
        "python3", script, pkg_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        async for raw_line in proc.stdout:  # type: ignore[union-attr]
            line = raw_line.decode("utf-8", errors="replace").rstrip()
            if line:
                yield f"data: {line}\n\n"
    finally:
        await proc.wait()
        # Clean up temp files regardless of success or failure
        for path in (pkg_path, storage_path):
            try:
                os.unlink(path)
            except OSError:
                pass


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze/{ticker}")
async def analyze(
    ticker: str,
    request: Request,
    x_daytona_secret: str | None = Header(None),
) -> StreamingResponse:
    _check_secret(x_daytona_secret)

    body: dict = await request.json()
    source_package = body.get("sourcePackage")
    storage_state = body.get("storageState")

    if source_package is None:
        raise HTTPException(status_code=400, detail="sourcePackage is required")
    if storage_state is None:
        raise HTTPException(status_code=400, detail="storageState is required")

    # Write both payloads to temp files — paths are local to this container
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, prefix=f"pkg-{ticker}-"
    ) as f:
        json.dump(source_package, f)
        pkg_path = f.name

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, prefix=f"state-{ticker}-"
    ) as f:
        json.dump(storage_state, f)
        storage_path = f.name

    return StreamingResponse(
        _stream_script(pkg_path, storage_path),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/vnc-start")
async def vnc_start(
    request: Request,
    x_daytona_secret: str | None = Header(None),
) -> dict[str, Any]:
    _check_secret(x_daytona_secret)
    # TODO: Start Xvfb + x11vnc + websockify; open Chromium to notebooklm.google.com
    # Returns streamUrl for noVNC WebSocket connection
    sandbox_id = os.environ.get("DAYTONA_SANDBOX_ID", "local")
    stream_url = f"wss://6080-{sandbox_id}.proxy.daytona.works"
    return {"streamUrl": stream_url}


@app.get("/vnc-status")
async def vnc_status(
    x_daytona_secret: str | None = Header(None),
) -> dict[str, Any]:
    _check_secret(x_daytona_secret)
    # TODO: Check if notebooklm login completed (storage_state.json populated)
    # Returns {captured: bool, encryptedState?: str}
    storage_path = os.environ.get("NOTEBOOKLM_AUTH_JSON",
                                   os.path.expanduser("~/.notebooklm/storage_state.json"))
    captured = os.path.exists(storage_path) and os.path.getsize(storage_path) > 100
    if captured:
        with open(storage_path) as f:
            return {"captured": True, "encryptedState": f.read()}
    return {"captured": False}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
