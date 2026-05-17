'use client';

// src/lib/use-theme.ts
// Runtime light/dark theme. Light is the default; the no-flash script in
// layout.tsx applies `.dark` on <html> before paint when the user has opted
// into dark. This hook reads/writes that class + persists the choice.

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'cipher-theme';

export function useTheme() {
  // Server + first client render assume light (matches the default). The
  // effect below syncs to whatever the no-flash script already applied.
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const setTheme = useCallback((next: boolean) => {
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      /* private mode / storage disabled — non-fatal */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(!document.documentElement.classList.contains('dark'));
  }, [setTheme]);

  return { dark, toggle, setTheme };
}
