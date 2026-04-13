#!/usr/bin/env python3
"""
Google Cloud Run container server — FastAPI SSE wrapper for notebooklm_research.py.
Receives POST /analyze/{ticker} with sourcePackage + storageState JSON.
Writes per-request temp files, spawns notebooklm_research.py, streams stdout as SSE.
POST /vnc-start — starts Xvfb + x11vnc + websockify + Playwright Chromium on virtual display.
GET /vnc-status — polls for NotebookLM login completion and returns captured storage_state.
DELETE /vnc-stop — tears down active VNC session.
GET /vnc-ws (WebSocket) — proxies VNC WebSocket frames through Cloud Run's single port (x-container-secret auth).
"""
import asyncio
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

SECRET = os.environ.get("CONTAINER_SECRET", "")


def _wait_for_port(port: int, timeout: float = 15.0) -> bool:
    """Block until localhost:port accepts a TCP connection or timeout expires."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("localhost", port), timeout=0.5):
                return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.25)
    return False


# ---------------------------------------------------------------------------
# VNC session state
# ---------------------------------------------------------------------------

@dataclass
class VncSession:
    display: Any = None
    x11vnc_proc: Any = None
    playwright: Any = None
    browser: Any = None
    context: Any = None
    page: Any = None
    captured_state: str | None = None
    active: bool = False
    user_data_dir: str | None = None  # temp dir for persistent Chromium profile


_vnc_session = VncSession()


async def _stop_vnc() -> None:
    """Tear down any active VNC session.  Errors in individual steps are swallowed
    so that one failure does not prevent the others from cleaning up."""
    global _vnc_session
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
    # Clean up persistent Chromium profile temp dir
    try:
        if _vnc_session.user_data_dir:
            shutil.rmtree(_vnc_session.user_data_dir, ignore_errors=True)
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


def _check_secret(x_container_secret: str | None) -> None:
    """Validate shared secret. Raises 401 if missing or wrong."""
    if not SECRET:
        raise HTTPException(status_code=500, detail="CONTAINER_SECRET not configured on container")
    if x_container_secret != SECRET:
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
    x_container_secret: str | None = Header(None),
) -> StreamingResponse:
    _check_secret(x_container_secret)

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
    x_container_secret: str | None = Header(None),
) -> dict[str, Any]:
    _check_secret(x_container_secret)

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

    # 2. Persistent profile dir — Chrome treats non-ephemeral profiles differently,
    #    which reduces GAIA's aggressiveness with cross-domain session sync on first load.
    user_data_dir = tempfile.mkdtemp(prefix="vnc-profile-")

    # 3. Launch Playwright Chromium via launch_persistent_context (no separate browser obj).
    #    Using a persistent context vs ephemeral context changes how Chrome initialises
    #    its session state manager, which reduces the number of GAIA cross-domain sync tabs.
    pw = await async_playwright().start()
    # Use Firefox for the VNC Google sign-in session.
    # Google's "This browser or app may not be secure" / /v3/signin/rejected check
    # exclusively targets Chromium-based embedded browsers (WebView detection).
    # Firefox is never caught by this check — Google's sign-in uses a different
    # validation path for Firefox that does not include the embedded-browser rejection.
    try:
        context = await pw.firefox.launch_persistent_context(
            user_data_dir,
            headless=False,
            viewport={"width": 1280, "height": 960},
            env={**os.environ, "DISPLAY": display_id},
        )
        print("[vnc] launched with Firefox (bypasses Google browser security check)", flush=True)
    except Exception as exc:
        await pw.stop()
        display.stop()
        shutil.rmtree(user_data_dir, ignore_errors=True)
        raise HTTPException(status_code=503, detail=f"Firefox launch failed: {exc}") from exc

    # launch_persistent_context opens one blank page automatically
    pages = context.pages
    page = pages[0] if pages else await context.new_page()

    # ---- Layer 1: Network-level abort for known GAIA cross-domain sync URLs ----
    # GAIA opens new tabs to these URLs to check whether the user is already signed in
    # on other Google services. On a fresh profile they always fail; GAIA detects the
    # failure and retries → infinite loop. Aborting at the network level means GAIA
    # gets an immediate network error rather than a "tab closed" signal, which breaks
    # the retry trigger without leaving any visible tab flicker.
    _GAIA_BLOCK_PATTERNS = [
        "*://accounts.youtube.com/**",
        "*://youtube.com/signin**",
        "*://myaccount.google.com/notifications**",
        "*://mail.google.com/accounts/**",
    ]

    async def _abort_route(route) -> None:
        try:
            await route.abort()
        except Exception:
            pass

    for _pattern in _GAIA_BLOCK_PATTERNS:
        await context.route(_pattern, _abort_route)

    # ---- Layer 2: JS-level window.open override (belt-and-suspenders) ----
    await context.add_init_script("""
        window.open = () => { console.error('[vnc] window.open blocked'); return null; };
        document.addEventListener('click', function(e) {
            var el = e.target && e.target.closest ? e.target.closest('a[target]') : null;
            if (el && el.target !== '_self' && el.target !== '') {
                e.preventDefault(); e.stopImmediatePropagation();
            }
        }, true);
    """)
    await context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )

    # ---- Layer 3: Close any tab that still slips through ----
    # CRITICAL: install a route-abort handler on the new page BEFORE closing it.
    # If we close the page immediately without aborting its requests, GAIA receives
    # a "tab closed unexpectedly" signal and retries — creating the infinite loop.
    # With route-abort installed first, GAIA sees a network error on the request and
    # does not schedule a retry.
    _popup_count = [0]

    async def _close_background_tab(new_page) -> None:
        _popup_count[0] += 1
        try:
            url = new_page.url
        except Exception:
            url = "<unknown>"
        print(f"[vnc-popup #{_popup_count[0]}] new page created url={url!r}", flush=True)
        # Abort all pending requests first — breaks the GAIA retry loop
        try:
            await new_page.route("**/*", _abort_route)
        except Exception:
            pass
        try:
            await new_page.close()
            print(f"[vnc-popup #{_popup_count[0]}] closed", flush=True)
        except Exception as e:
            print(f"[vnc-popup #{_popup_count[0]}] close error: {e!r}", flush=True)

    context.on("page", lambda p: asyncio.ensure_future(_close_background_tab(p)))

    # ---- Layer 4: Strip osid=1 from all accounts.google.com requests ----
    # osid=1 triggers Google's v3 dialog-mode which runs stricter browser checks and
    # routes to /v3/signin/rejected for any automated/cloud browser. We intercept every
    # request to accounts.google.com and rewrite the URL to remove osid=1 before it lands.
    async def _strip_osid(route) -> None:
        url = route.request.url
        if "osid=1" in url:
            url = url.replace("&osid=1", "").replace("osid=1&", "").replace("?osid=1", "?")
            try:
                await route.continue_(url=url)
            except Exception:
                await route.continue_()
        else:
            await route.continue_()

    await context.route("**/accounts.google.com/**", _strip_osid)

    # Navigate to NotebookLM directly and let it redirect naturally to Google sign-in.
    # This avoids hardcoding any Google sign-in URL parameters (including osid=1) and
    # lets the osid-strip route above handle any that appear in the redirect chain.
    await page.goto("https://notebooklm.google.com/")

    # 4. Start x11vnc (attach to virtual display, expose raw VNC on port 5900).
    # The /vnc-ws proxy connects directly to port 5900 (raw RFB TCP).
    try:
        x11vnc_proc = subprocess.Popen(
            ["x11vnc", "-display", display_id, "-rfbport", "5900",
             "-nopw", "-forever", "-quiet"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError as exc:
        await context.close()
        await pw.stop()
        display.stop()
        shutil.rmtree(user_data_dir, ignore_errors=True)
        raise HTTPException(status_code=503, detail="x11vnc not found") from exc

    # Store session globally (browser=None — persistent context owns itself)
    _vnc_session = VncSession(
        display=display,
        x11vnc_proc=x11vnc_proc,
        playwright=pw,
        browser=None,
        context=context,
        page=page,
        captured_state=None,
        active=True,
        user_data_dir=user_data_dir,
    )

    # Wait for x11vnc to be ready before returning — avoids black-screen race
    # where the browser tries to connect before port 5900 is listening.
    if not _wait_for_port(5900, timeout=15.0):
        await _stop_vnc()
        raise HTTPException(status_code=503, detail="x11vnc did not become ready in time")

    return {"started": True}


@app.get("/vnc-status")
async def vnc_status(
    x_container_secret: str | None = Header(None),
) -> dict[str, Any]:
    _check_secret(x_container_secret)

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

    # Google session cookies that only appear AFTER successful Google sign-in.
    # Informational cookies (NID, OTZ, __Host-GAPS, CONSENT) appear on page-load
    # and must NOT be used for login detection — they cause false positives.
    _AUTH_COOKIE_NAMES = frozenset({
        "SID", "SSID", "HSID", "APISID", "SAPISID",
        "__Secure-1PSID", "__Secure-3PSID",
        "__Secure-1PAPISID", "__Secure-3PAPISID",
    })
    google_auth_cookies = [
        c for c in state.get("cookies", [])
        if c.get("name", "") in _AUTH_COOKIE_NAMES
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
        len(google_auth_cookies) >= 1
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
        # Navigate to blank immediately so the VNC stream shows nothing —
        # prevents user from seeing their NotebookLM notebooks in the VNC window.
        try:
            await _vnc_session.page.goto("about:blank")
        except Exception:
            pass
        return {"captured": True, "encryptedState": captured_state}

    return {"captured": False}


@app.delete("/vnc-stop")
async def vnc_stop(
    x_container_secret: str | None = Header(None),
) -> dict[str, str]:
    _check_secret(x_container_secret)
    await _stop_vnc()
    return {"status": "stopped"}


@app.websocket("/vnc-ws")
async def vnc_ws_proxy(websocket: WebSocket) -> None:
    """Proxy WebSocket frames between react-vnc browser client and x11vnc on localhost:5900.

    Cloud Run exposes only one port (8080/443). The browser cannot reach port 5900 directly.
    FastAPI handles the WebSocket protocol with the browser (accepts the WS upgrade, decodes frames).
    The proxy then relays raw RFB bytes between the browser and x11vnc over a plain TCP connection.
    This is equivalent to what websockify does, but without an extra process hop.
    """
    # Validate shared secret from header (WebSocket upgrade headers are accessible via websocket.headers)
    # Also accept via query param as fallback for clients that cannot set custom headers on WS upgrade
    secret = websocket.headers.get("x-container-secret") or websocket.query_params.get("secret")
    _check_secret(secret)

    if not _vnc_session.active:
        await websocket.close(code=1008, reason="No active VNC session")
        return

    # Pass through the WebSocket subprotocol that react-vnc/noVNC sends (typically "binary")
    subprotocols = websocket.headers.get("sec-websocket-protocol", "")
    subprotocol = subprotocols.split(",")[0].strip() if subprotocols else None
    await websocket.accept(subprotocol=subprotocol)

    try:
        # Connect to x11vnc raw RFB TCP on port 5900
        reader, writer = await asyncio.open_connection("localhost", 5900)

        async def browser_to_x11vnc() -> None:
            try:
                while True:
                    data = await websocket.receive_bytes()
                    writer.write(data)
                    await writer.drain()
            except (WebSocketDisconnect, Exception):
                pass

        async def x11vnc_to_browser() -> None:
            try:
                while True:
                    data = await reader.read(4096)
                    if not data:
                        break
                    await websocket.send_bytes(data)
            except Exception:
                pass

        await asyncio.gather(browser_to_x11vnc(), x11vnc_to_browser())
    finally:
        try:
            writer.close()
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
