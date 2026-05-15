# Phase 30 D-21 — Firecrawl key rotation log

**Operator:** {operator fills in — name / email}
**Started:** {ISO timestamp}
**Completed:** {ISO timestamp}

## Pre-rotation state

- Old key fingerprint: `fc-________` (first 8 chars only — NEVER paste the full key)
- Last successful call (UTC): `____-__-__T__:__:__Z`
- Recent error sample (5 rows):

  | started_at | error_class | http_status |
  |------------|-------------|-------------|
  | ...        | ...         | ...         |
  | ...        | ...         | ...         |
  | ...        | ...         | ...         |
  | ...        | ...         | ...         |
  | ...        | ...         | ...         |

## Rotation steps

- [ ] Step 1 — Captured pre-rotation state (Vercel env pull + Neon SQL queries)
- [ ] Step 2 — Generated new key on Firecrawl dashboard (New key fingerprint: `fc-________`)
- [ ] Step 3 — Pushed new key to Vercel production + preview envs (`vercel env rm` then `vercel env add`)
- [ ] Step 4 — Redeployed production (URL: `__________`)
- [ ] Step 5 — Verified new key works (first `status='ok'` row at: `____-__-__T__:__:__Z`)
- [ ] Step 6 — Revoked OLD key on Firecrawl dashboard (revocation timestamp: `____-__-__T__:__:__Z`)
- [ ] Step 7 — Updated local `.env.local` (or N/A if not needed)

## Post-rotation verification SQL output

```
{paste output of:
  SELECT started_at, status, error_class, http_status
  FROM provider_call_logs
  WHERE provider_id = 'firecrawl'
    AND started_at > NOW() - INTERVAL '15 minutes'
  ORDER BY started_at DESC
  LIMIT 5;
}
```

At least one row MUST show `status='ok'`. If all rows are `status='error'`, the rotation failed — abort and escalate.

## D-22 trigger watch

Per CONTEXT.md D-22, if the rotated key dies again within ONE WEEK of this rotation
(i.e., before `____-__-__`), the next phase planner migrates community-scan to Exa.
Otherwise Firecrawl stays primary.

---

*Audit log scaffolding created by Plan 30-05 Task 2. Operator completes all fields above during the rotation procedure (see 30-05-PLAN.md Task 2 body for the full procedure).*
