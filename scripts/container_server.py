#!/usr/bin/env python3
"""
Daytona container server — FastAPI SSE wrapper for notebooklm_research.py.
Receives POST /analyze/{ticker} with sourcePackage + storageState JSON.
Writes per-request temp files, spawns notebooklm_research.py, streams stdout as SSE.
POST /vnc-start — starts Xvfb + x11vnc + websockify + Playwright Chromium on virtual display.
GET /vnc-status — polls for NotebookLM login completion and returns captured storage_state.
DELETE /vnc-stop — tears down active VNC session.
"""
import asyncio
import json
import os
import subprocess
import tempfile
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

SECRET = os.environ.get("DAYTONA_SECRET", "")


# ---------------------------------------------------------------------------
# VNC session state
# ---------------------------------------------------------------------------

@dataclass
class VncSession:
    display: Any = None
    x11vnc_proc: Any = None
    wsockify_proc: Any = None
    playwright: Any = None
    browser: Any = None
    context: Any = None
    page: Any = None
    captured_state: str | None = None
    active: bool = False


_vnc_session = VncSession()


async def _stop_vnc() -> None:
    """Tear down any active VNC session.  Errors in individual steps are swallowed
    so that one failure does not prevent the others from cleaning up."""
    global _vnc_session
    # Kill websockify
    try:
        if _vnc_session.wsockify_proc and _vnc_session.wsockify_proc.poll() is None:
            _vnc_session.wsockify_proc.kill()
    except Exception:
        pass
    # Kill x11vnc
    try:
        if _vnc_session.x11vnc_proc and _vnc_session.x11vnc_proc.poll() is None:
            _vnc_session.x11vnc_proc.kill()
    except Exception:
        pass
    # Close Playwright browser + context
    try:
        if _vnc_session.page:
            await _vnc_session.page.close()
    except Exception:
        pass
    try:
        if _vnc_session.context:
            await _vnc_session.context.close()
    except Exception:
        pass
    try:
        if _vnc_session.browser:
            await _vnc_session.browser.close()
    except Exception:
        pass
    try:
        if _vnc_session.playwright:
            await _vnc_session.playwright.stop()
    except Exception:
        pass
    # Stop virtual display
    try:
        if _vnc_session.display:
            _vnc_session.display.stop()
    except Exception:
        pass
    _vnc_session = VncSession()

app = FastAPI(title="Ticker Research Container Server")

# Allow the Vercel frontend origin to call this server.
# ALLOWED_ORIGIN env var should be set to the Vercel domain (e.g. https://ticker-research.vercel.app)
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_methods=["GET", "POST", "DELETE"],
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

    global _vnc_session

    # Clean up any existing session before starting a new one.
    await _stop_vnc()

    try:
        from pyvirtualdisplay import Display  # type: ignore[import]
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Missing dependency: {exc}") from exc

    # 1. Start virtual display
    display = Display(visible=False, size=(1280, 960), backend="xvfb")
    display.start()
    display_id = f":{display.display}"
    os.environ["DISPLAY"] = display_id

    # 2. Launch Playwright Chromium non-headless on that virtual display
    pw = await async_playwright().start()
    try:
        browser = await pw.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            env={**os.environ, "DISPLAY": display_id},
        )
    except Exception as exc:
        await pw.stop()
        display.stop()
        raise HTTPException(status_code=503, detail=f"Chromium launch failed: {exc}") from exc

    context = await browser.new_context(viewport={"width": 1280, "height": 960})
    page = await context.new_page()
    await page.goto("https://notebooklm.google.com")

    # 3. Start x11vnc (attach to virtual display, expose on port 5900)
    try:
        x11vnc_proc = subprocess.Popen(
            ["x11vnc", "-display", display_id, "-rfbport", "5900",
             "-nopw", "-forever", "-quiet", "-bg"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError as exc:
        await context.close()
        await browser.close()
        await pw.stop()
        display.stop()
        raise HTTPException(status_code=503, detail="x11vnc not found") from exc

    # 4. Start websockify (bridge VNC port 5900 → WebSocket port 6080)
    try:
        wsockify_proc = subprocess.Popen(
            ["websockify", "0.0.0.0:6080", "localhost:5900"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError as exc:
        x11vnc_proc.kill()
        await context.close()
        await browser.close()
        await pw.stop()
        display.stop()
        raise HTTPException(status_code=503, detail="websockify not found") from exc

    # Store session globally
    _vnc_session = VncSession(
        display=display,
        x11vnc_proc=x11vnc_proc,
        wsockify_proc=wsockify_proc,
        playwright=pw,
        browser=browser,
        context=context,
        page=page,
        captured_state=None,
        active=True,
    )

    sandbox_id = os.environ.get("DAYTONA_SANDBOX_ID", "local")
    stream_url = f"wss://6080-{sandbox_id}.proxy.daytona.works"
    return {"streamUrl": stream_url}


@app.get("/vnc-status")
async def vnc_status(
    x_daytona_secret: str | None = Header(None),
) -> dict[str, Any]:
    _check_secret(x_daytona_secret)

    if not _vnc_session.active:
        return {"captured": False}

    # If login was already captured in a previous poll, return immediately.
    if _vnc_session.captured_state is not None:
        return {"captured": True, "encryptedState": _vnc_session.captured_state}

    # Inspect current browser state
    try:
        state = await _vnc_session.context.storage_state()
    except Exception:
        return {"captured": False}

    google_cookies = [
        c for c in state.get("cookies", [])
        if ".google.com" in c.get("domain", "")
    ]
    nbm_cookies = [
        c for c in state.get("cookies", [])
        if "notebooklm" in c.get("domain", "") or "notebooklm" in c.get("name", "")
    ]

    try:
        url = _vnc_session.page.url
    except Exception:
        url = ""

    logged_in = (
        len(google_cookies) >= 3
        or len(nbm_cookies) > 0
        or (
            "notebooklm.google.com" in url
            and "ServiceLogin" not in url
            and "accounts.google.com" not in url
        )
    )

    if logged_in:
        captured_state = json.dumps(state)
        _vnc_session.captured_state = captured_state
        return {"captured": True, "encryptedState": captured_state}

    return {"captured": False}


@app.delete("/vnc-stop")
async def vnc_stop(
    x_daytona_secret: str | None = Header(None),
) -> dict[str, str]:
    _check_secret(x_daytona_secret)
    await _stop_vnc()
    return {"status": "stopped"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
