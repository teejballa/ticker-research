#!/usr/bin/env python3
"""Extract connected Google account email from stored Playwright session.

Usage: python3 scripts/get_email.py
Output: prints email to stdout, empty string if not found
Exit 0: success (even if no email found)
Exit 1: fatal error (missing playwright, etc.)
"""
import asyncio
import os
import re
import sys
from pathlib import Path

NOTEBOOKLM_HOME = os.environ.get('NOTEBOOKLM_HOME', str(Path.home() / '.notebooklm'))
STORAGE_STATE = os.path.join(NOTEBOOKLM_HOME, 'storage_state.json')

FILTER_WORDS = ['example', 'prober', 'w3.org', 'schema', 'google.com']


async def get_email() -> str:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        sys.exit(1)

    if not os.path.exists(STORAGE_STATE):
        return ''

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            ctx = await browser.new_context(storage_state=STORAGE_STATE)
            page = await ctx.new_page()
            try:
                await page.goto('https://myaccount.google.com/', timeout=8000)
                await page.wait_for_timeout(1500)
                content = await page.content()
                emails = re.findall(
                    r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}',
                    content
                )
                filtered = [
                    e for e in emails
                    if not any(w in e.lower() for w in FILTER_WORDS)
                ]
                return filtered[0] if filtered else ''
            except Exception:
                return ''
            finally:
                await page.close()
                await ctx.close()
        finally:
            await browser.close()


if __name__ == '__main__':
    try:
        email = asyncio.run(get_email())
        print(email)
    except Exception:
        sys.exit(1)
