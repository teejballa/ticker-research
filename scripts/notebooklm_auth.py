#!/usr/bin/env python3
"""
notebooklm_auth.py
One-time Google auth for NotebookLM. Opens a browser window, waits for the
user to complete Google login, saves storage_state.json automatically, shows
a success screen, then closes the browser. No terminal interaction required.

Stdout protocol (read by the Next.js API route):
  PROGRESS: <message>   — status update for the UI
  COMPLETE              — auth saved successfully
  ERROR: <message>      — something went wrong
"""
import asyncio
import os
import sys
from pathlib import Path

NOTEBOOKLM_URL = "https://notebooklm.google.com"
TIMEOUT_SECONDS = 600  # 10 minutes

SUCCESS_HTML = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; align-items: center; justify-content: center;
      height: 100vh; background: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .card {
      text-align: center; padding: 48px;
    }
    .check {
      width: 72px; height: 72px; border-radius: 50%;
      background: #e6f4ea; display: flex; align-items: center;
      justify-content: center; margin: 0 auto 24px;
      font-size: 36px;
    }
    h1 { font-size: 22px; color: #1a1a1a; margin-bottom: 8px; }
    p  { font-size: 14px; color: #888; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>Connected to Google</h1>
    <p>You're all set. This window will close automatically.</p>
  </div>
</body>
</html>
"""


async def main() -> int:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("ERROR: playwright is not installed. Run the install step first.", flush=True)
        return 1

    notebooklm_home = os.environ.get("NOTEBOOKLM_HOME", str(Path.home() / ".notebooklm"))
    storage_path = os.path.join(notebooklm_home, "storage_state.json")
    os.makedirs(notebooklm_home, exist_ok=True)

    print("PROGRESS: Opening browser...", flush=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        )
        # Remove navigator.webdriver flag that Google uses to detect automation
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        page = await context.new_page()

        # Navigate to NotebookLM — Google OAuth redirect kicks in if not logged in
        await page.goto(NOTEBOOKLM_URL)
        print("PROGRESS: Log in with your Google account...", flush=True)

        # Poll until we land back on notebooklm.google.com (past all Google auth redirects)
        deadline = asyncio.get_event_loop().time() + TIMEOUT_SECONDS
        while True:
            url = page.url
            on_notebooklm = url.startswith("https://notebooklm.google.com")
            past_google_auth = (
                "accounts.google.com" not in url
                and "ServiceLogin" not in url
            )

            if on_notebooklm and past_google_auth:
                break

            if asyncio.get_event_loop().time() > deadline:
                print("ERROR: Login timed out after 10 minutes.", flush=True)
                await browser.close()
                return 1

            await asyncio.sleep(1)

        # Let the page settle so all cookies/localStorage are fully written
        try:
            await page.wait_for_load_state("networkidle", timeout=15_000)
        except Exception:
            pass  # Not fatal — storage_state will still capture what's there

        print("PROGRESS: Saving credentials...", flush=True)
        await context.storage_state(path=storage_path)

        # Signal success immediately — before any potentially-throwing code
        print("COMPLETE", flush=True)

        # Best-effort: show a success screen then close gracefully.
        # If anything here throws it doesn't matter — auth is already saved.
        try:
            await page.set_content(SUCCESS_HTML)
            await asyncio.sleep(2)
            await browser.close()
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
