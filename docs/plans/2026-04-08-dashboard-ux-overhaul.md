# Dashboard & UX Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a personalized `/dashboard` home for logged-in users, add a slide-over account drawer with X button to NavBar, and add escape hatches (X/back buttons) throughout the app.

**Architecture:** New `/dashboard` page becomes the post-login home (replacing `/terminal` as the redirect target after setup). NavBar gains an account slide-over drawer (no page navigation). Setup page redirects to `/dashboard` on completion. A `providers.tsx` wrapper enables `useSession` app-wide.

**Tech Stack:** Next.js 14 App Router, NextAuth v4, Tailwind CSS (design tokens in `globals.css`), `next-auth/react` SessionProvider

---

## Task 1: Add SessionProvider wrapper

**Files:**
- Create: `src/app/providers.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create providers.tsx**

```tsx
// src/app/providers.tsx
'use client';
import { SessionProvider } from 'next-auth/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

**Step 2: Wrap layout in Providers**

In `src/app/layout.tsx`, import `Providers` and wrap `{children}`:

```tsx
import { Providers } from './providers';
// ...
<body ...>
  <Providers>{children}</Providers>
</body>
```

**Step 3: Verify**
Run `npm run dev` — no TypeScript errors. The `useSession()` hook should now resolve properly in any client component.

**Step 4: Commit**
```bash
git add src/app/providers.tsx src/app/layout.tsx
git commit -m "feat: add SessionProvider wrapper to root layout"
```

---

## Task 2: Create /dashboard page

**Files:**
- Create: `src/app/dashboard/page.tsx`

**Design intent:**
- Warm, personal — NOT cold all-caps cipher aesthetic
- Time-aware greeting: "Good morning, TJ" (first name from session or email prefix)
- Two-column layout: left = search + tickers; right = report history
- Bottom: account info card (email, NbLM status, sign out)
- Accent: secondary color (#66d9cc teal) not harsh primary blue
- Background: same `bg-surface` dark, dot-grid for continuity

**Implementation:**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import TickerSearch from '@/components/TickerSearch';
import ReportHistory from '@/components/ReportHistory';

interface SetupStatus {
  userEmail: string | null;
  nbmSessionActive?: boolean;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getFirstName(name: string | null | undefined, email: string | null | undefined): string {
  if (name) return name.split(' ')[0];
  if (email) return email.split('@')[0].split('.')[0];
  return 'there';
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    fetch('/api/setup/status')
      .then(r => r.json())
      .then((d: SetupStatus) => setStatus(d))
      .catch(() => {});
  }, []);

  const userEmail = session?.user?.email ?? status?.userEmail ?? null;
  const userName = getFirstName(session?.user?.name, userEmail);
  const nbmActive = status?.nbmSessionActive ?? false;
  const greeting = getGreeting();

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <NavBar userEmail={userEmail} />

      <main className="pt-[44px]">
        {/* ── Greeting header ── */}
        <div className="border-b border-outline-variant/10 bg-surface-container-low/40">
          <div className="max-w-6xl mx-auto px-6 py-10">
            <p className="text-secondary text-sm font-medium mb-1 tracking-wide">
              {greeting},
            </p>
            <h1 className="text-4xl font-black text-on-surface tracking-tight mb-2">
              {userName} —
            </h1>
            <p className="text-on-surface-variant text-base">
              Here's your research workspace.
            </p>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">

            {/* LEFT: Search + quick actions */}
            <div className="space-y-6">
              <div>
                <h2 className="text-xs font-bold tracking-[0.3em] text-outline uppercase mb-4">
                  New Research
                </h2>
                <TickerSearch />
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-[10px] font-mono text-outline tracking-widest">TRY</span>
                  {['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'].map((sym) => (
                    <button
                      key={sym}
                      onClick={() => router.push(`/research/${sym}`)}
                      className="text-[10px] font-mono text-outline-variant px-2 py-0.5 border border-outline-variant/20 rounded hover:border-secondary/40 hover:text-secondary transition-colors"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick links */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => router.push('/terminal')}
                  className="bg-surface-container border border-outline-variant/20 p-4 text-left hover:border-primary/30 hover:bg-surface-container-high transition-all group"
                >
                  <span className="material-symbols-outlined text-primary text-xl mb-2 block">terminal</span>
                  <div className="text-sm font-bold text-on-surface">Research Terminal</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">Focused analysis mode</div>
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="bg-surface-container border border-outline-variant/20 p-4 text-left hover:border-secondary/30 hover:bg-surface-container-high transition-all group"
                >
                  <span className="material-symbols-outlined text-secondary text-xl mb-2 block">home</span>
                  <div className="text-sm font-bold text-on-surface">Home</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">Marketing overview</div>
                </button>
              </div>
            </div>

            {/* RIGHT: Recent reports + account */}
            <div className="space-y-6">
              {/* Recent reports */}
              <div>
                <ReportHistory />
              </div>

              {/* Account card */}
              <div className="bg-surface-container border border-outline-variant/20 p-5 space-y-4">
                <div className="text-[10px] font-bold tracking-[0.3em] text-outline uppercase">
                  Account
                </div>

                {/* Email */}
                <div>
                  <div className="text-[10px] text-primary/50 tracking-widest uppercase mb-1">Connected as</div>
                  <div className="text-xs font-mono text-on-surface">{userEmail ?? '—'}</div>
                </div>

                {/* NbLM status */}
                <div>
                  <div className="text-[10px] text-primary/50 tracking-widest uppercase mb-1">Research Engine</div>
                  {nbmActive ? (
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                      <span className="text-[11px] font-mono text-secondary">Connected</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                        <span className="text-[11px] font-mono text-tertiary">Session expired</span>
                      </div>
                      <button
                        onClick={() => router.push('/setup')}
                        className="text-[10px] font-bold tracking-wider text-tertiary border border-tertiary/30 px-2 py-1 hover:bg-tertiary/10 transition-colors"
                      >
                        RECONNECT →
                      </button>
                    </div>
                  )}
                </div>

                {/* Sign out */}
                <button
                  onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                  className="text-[10px] font-bold tracking-widest uppercase text-outline hover:text-error/70 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add personalized /dashboard page with greeting, search, and account"
```

---

## Task 3: Update setup redirect to /dashboard

**Files:**
- Modify: `src/app/setup/page.tsx`

**Change:** In `confirmAndNavigate()`, replace both `router.push('/terminal')` calls with `router.push('/dashboard')`.

Find:
```ts
router.push('/terminal');
```
Replace all occurrences (2 total) with:
```ts
router.push('/dashboard');
```

**Step 2: Commit**
```bash
git add src/app/setup/page.tsx
git commit -m "feat: redirect to /dashboard after NotebookLM setup completes"
```

---

## Task 4: Add X close button to setup page

**Files:**
- Modify: `src/app/setup/page.tsx`

**Change:** Update the `Shell` component to accept an optional `onClose` prop. When provided, render an X button top-right. Pass `onClose={() => router.push('/dashboard')}` from `idle` and `error` states (not `checking` or `waiting` states — those are in-progress).

**Updated Shell:**
```tsx
function Shell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center font-mono"
      style={{ backgroundColor: '#080a0f' }}
    >
      <div
        className="w-96 max-sm:w-full max-sm:mx-4 p-8 relative"
        style={{ border: '1px solid #1a2d42' }}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-[#3a5070] hover:text-[#8d90a2] transition-colors"
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
          >
            ✕
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
```

Pass `onClose` in idle and error states:
```tsx
// idle state:
return (
  <Shell onClose={() => router.push('/dashboard')}>
    ...
  </Shell>
);

// error state:
return (
  <Shell onClose={() => router.push('/dashboard')}>
    ...
  </Shell>
);
```

**Step 2: Commit**
```bash
git add src/app/setup/page.tsx
git commit -m "feat: add X close button to setup page idle/error states"
```

---

## Task 5: Add account slide-over drawer to NavBar

**Files:**
- Modify: `src/components/NavBar.tsx`

**Design:**
- Clicking "ACCOUNT" → sets `drawerOpen = true` (no page navigation)
- Dark backdrop: `fixed inset-0 bg-black/60 backdrop-blur-sm z-40`
- Panel: `fixed right-0 top-0 h-full w-80 bg-surface-container border-l border-outline-variant/20 z-50`
- Slide in: CSS `translate-x-0` when open, `translate-x-full` when closed, with `transition-transform duration-300`
- X button top-right of panel
- Click backdrop to close
- Escape key to close
- Content fetched from `/api/setup/status` when drawer opens
- Contents: email, NbLM status (with reconnect if expired), sign-out button

**Change the ACCOUNT link to a button:**
```tsx
// Replace:
<Link href="/account" ...>ACCOUNT</Link>

// With:
<button
  onClick={() => setDrawerOpen(true)}
  className="text-sm font-bold text-on-surface/50 hover:bg-surface-container transition-colors duration-200 px-2 py-1"
>
  ACCOUNT
</button>
```

**Add drawer state and fetch at top of NavBar component:**
```tsx
const [drawerOpen, setDrawerOpen] = useState(false);
const [drawerStatus, setDrawerStatus] = useState<{ userEmail?: string | null; nbmSessionActive?: boolean } | null>(null);

useEffect(() => {
  if (!drawerOpen) return;
  fetch('/api/setup/status')
    .then(r => r.json())
    .then(d => setDrawerStatus(d))
    .catch(() => {});
}, [drawerOpen]);

useEffect(() => {
  if (!drawerOpen) return;
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setDrawerOpen(false); }
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [drawerOpen]);
```

**Add drawer JSX after the closing `</>` of the sub-bar, inside the fragment:**
```tsx
{/* Account drawer */}
{drawerOpen && (
  <>
    {/* Backdrop */}
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
      onClick={() => setDrawerOpen(false)}
    />
    {/* Panel */}
    <div
      className="fixed right-0 top-0 h-full w-80 bg-surface-container border-l border-outline-variant/20 z-50 flex flex-col"
      style={{
        transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
      }}
    >
      {/* Drawer header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
        <span className="text-[10px] font-bold tracking-[0.3em] text-outline uppercase">Account</span>
        <button
          onClick={() => setDrawerOpen(false)}
          className="text-outline hover:text-on-surface transition-colors"
          aria-label="Close account panel"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>

      {/* Drawer body */}
      <div className="flex-1 px-5 py-6 space-y-6 overflow-y-auto">
        {/* Email */}
        <div>
          <div className="text-[10px] text-primary/50 tracking-widest uppercase mb-1">Connected as</div>
          <div className="text-xs font-mono text-on-surface">
            {drawerStatus?.userEmail ?? userEmail ?? '—'}
          </div>
        </div>

        {/* NbLM status */}
        <div>
          <div className="text-[10px] text-primary/50 tracking-widest uppercase mb-2">Research Engine</div>
          {drawerStatus?.nbmSessionActive ? (
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              <span className="text-[11px] font-mono text-secondary">Connected</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                <span className="text-[11px] font-mono text-tertiary">Session expired</span>
              </div>
              <Link
                href="/setup"
                onClick={() => setDrawerOpen(false)}
                className="text-[10px] font-bold tracking-wider text-tertiary border border-tertiary/30 px-2 py-1 hover:bg-tertiary/10 transition-colors inline-block"
              >
                RECONNECT →
              </Link>
            </div>
          )}
        </div>

        {/* Dashboard link */}
        <div>
          <Link
            href="/dashboard"
            onClick={() => setDrawerOpen(false)}
            className="text-[10px] font-bold tracking-widest uppercase text-primary/70 hover:text-primary transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      {/* Sign out */}
      <div className="px-5 py-4 border-t border-outline-variant/20">
        <button
          onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          className="text-[10px] font-bold tracking-widest uppercase text-outline hover:text-error/70 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  </>
)}
```

**Required imports to add to NavBar.tsx:**
```tsx
import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
```

**Step 2: Commit**
```bash
git add src/components/NavBar.tsx
git commit -m "feat: replace account page link with slide-over drawer in NavBar"
```

---

## Task 6: Add back button / close to ChartConfirmation

ChartConfirmation already has a `← BACK` button in the action panel (see line 167-173). It's functional but small. Make it slightly more visible by giving it a clearer label:

**Files:**
- Modify: `src/components/ChartConfirmation.tsx`

Change the back button `onClick` to push to `/dashboard` instead of `/`:
```tsx
// Find:
onClick={() => router.push('/')}
// Replace with:
onClick={() => router.push('/dashboard')}
```

This is a 1-line change. The button already exists and works — just routes to a better destination.

**Step 2: Commit**
```bash
git add src/components/ChartConfirmation.tsx
git commit -m "fix: route chart confirmation back button to /dashboard"
```

---

## Task 7: Update account/page.tsx to redirect to dashboard

The `/account` page is now superseded by the drawer. Keep it alive but have it redirect to `/dashboard` so old bookmarks don't break.

**Files:**
- Modify: `src/app/account/page.tsx`

Replace the entire file content with a simple redirect:
```tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AccountPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return null;
}
```

**Step 2: Commit**
```bash
git add src/app/account/page.tsx
git commit -m "feat: redirect /account to /dashboard (account now in slide-over drawer)"
```

---

## Final verification checklist

- [ ] `npm run build` — no TypeScript errors
- [ ] `/dashboard` loads with greeting, search, report history, account card
- [ ] Clicking ACCOUNT in NavBar opens drawer (no page navigation)
- [ ] X button and backdrop click close the drawer
- [ ] Escape key closes the drawer
- [ ] Sign out in drawer works (redirects to signin)
- [ ] Setup complete → redirects to `/dashboard`
- [ ] Setup page X button appears in idle/error states, goes to `/dashboard`
- [ ] `/account` redirects to `/dashboard`
- [ ] Chart confirmation back button → `/dashboard`
- [ ] Terminal page still accessible at `/terminal`
- [ ] Existing report history and research flows unbroken

---

## Notes

- **Session provider**: Adding `SessionProvider` in `providers.tsx` is safe for NextAuth v4. It uses JWT strategy so no DB sessions.
- **Greeting name**: Derived from `session.user.name` (Google provides full name) → first word only. Falls back to email prefix. Falls back to "there".
- **NbLM status in drawer**: Fetched fresh each time drawer opens — ensures accurate state without stale cache.
- **No new API routes needed** — all data comes from existing `/api/setup/status`.
- **`/terminal` stays unchanged** — it's still the focused research tool; quick-link card on dashboard routes there.
