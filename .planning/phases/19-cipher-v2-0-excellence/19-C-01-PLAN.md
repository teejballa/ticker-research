---
phase: 19
plan: 19-C-01
wave: C
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04]
files_modified:
  - src/lib/sentiment/finsentllm.ts
  - tests/lib/sentiment/finsentllm.test.ts
  - package.json
  - .env.example
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "classifyFinGPT(text) returns SentimentScore with score ∈ [-1,1] OR null"
    - "classifyMistralFin(text) returns SentimentScore"
    - "classifyFinBERT(text) returns SentimentScore"
    - "All three return null sentinel on API error (do NOT throw per D-33)"
    - "@huggingface/inference v4.13.15 pinned"
    - "HF endpoint provisioning step documented (RESEARCH §Environment — endpoints not yet provisioned)"
    - "HF model revisions pinned in code comment (RESEARCH Open Question 1)"
  artifacts:
    - path: "src/lib/sentiment/finsentllm.ts"
      provides: "FinSentLLM clients for FinGPT v3 / Mistral 7B fin-tuned / FinBERT"
      exports: ["classifyFinGPT", "classifyMistralFin", "classifyFinBERT", "SentimentScore"]
    - path: "tests/lib/sentiment/finsentllm.test.ts"
      provides: "4 unit tests with mocked @huggingface/inference"
  key_links:
    - from: "src/lib/sentiment/finsentllm.ts"
      to: "@huggingface/inference"
      via: "HfInference client per endpoint"
      pattern: "from '@huggingface/inference'"
---

# Plan 19-C-01: HF Inference Endpoint + FinSentLLM client

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Land 3 client functions + tests → smoke test against staging HF endpoints (or marked manual if not yet provisioned) → commit. No shadow needed (primitive client; not yet wired into hot path).

## Hard Cleanup Gate (Definition of Done)

1. (N/A — primitive only) 2-4. (N/A) 5. `npm test` green; smoke test against HF endpoints succeeds (or documented as PENDING in SUMMARY)

</universal_preamble>

<objective>
Per D-33, deliver three independent HF Inference Endpoint clients for FinGPT v3, Mistral 7B finance-tuned, and FinBERT. Uniform `SentimentScore` interface; null sentinels on error (do not throw). Foundation for 19-C-02 (ensemble) and 19-C-08 (CoVe NLI).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md

<interfaces>
```typescript
export interface SentimentScore {
  score: number | null;        // [-1, 1] — positive bullish, negative bearish
  confidence: number | null;   // [0, 1] — max class probability
  model: 'fingpt-v3' | 'mistral-fin-7b' | 'finbert';
  error?: string;
}

export const classifyFinGPT: (text: string) => Promise<SentimentScore>;
export const classifyMistralFin: (text: string) => Promise<SentimentScore>;
export const classifyFinBERT: (text: string) => Promise<SentimentScore>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-C-01-01 | Information Disclosure | HF endpoint URL in error logs | mitigate | RESEARCH §Security: endpoint URLs include opaque IDs; treat as secrets; never log full URL on error (strip via sanitizeUrl pattern from 19-Z-03) |
| T-19-C-01-02 | DoS | HF cold-start latency 10-30s on idle endpoints | mitigate | Returns null sentinel rather than blocking; 19-C-02 ensemble degrades gracefully; warm-up cron may be added in C-02 if shadow latency too high (per RESEARCH Pitfall 4) |
| T-19-C-01-03 | Tampering | wrong model returns mislabeled scores | mitigate | reduceLabels() validates label prefixes (pos/neg) — labels not matching either yield score=0 conservative neutral; HF model revisions pinned in code comment |

</threat_model>

<tasks>

<task type="auto" id="19-C-01-01">
  <name>Task 1: Install @huggingface/inference + add env vars</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (line 152 — version 4.13.15 verified 2026-03-06)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 858-887 — Environment Availability + provisioning gap)
  </read_first>
  <action>
    `npm install @huggingface/inference@^4.13.15`. Append to `.env.example`:
    ```
    # Phase 19-C-01 — HuggingFace Inference Endpoints (~$10/mo total)
    # NOTE: 3 endpoints must be provisioned BEFORE this code runs in production.
    # Per RESEARCH §Environment Availability, endpoints not yet provisioned as of 2026-05-06.
    HF_INFERENCE_TOKEN=
    HF_FINGPT_ENDPOINT=
    HF_MISTRAL_FIN_ENDPOINT=
    HF_FINBERT_ENDPOINT=
    ```
  </action>
  <acceptance_criteria>
    - `grep -q '"@huggingface/inference"' package.json`
    - `node -e "require('@huggingface/inference')"` does not throw
    - `grep -c "HF_FINGPT_ENDPOINT\|HF_MISTRAL_FIN_ENDPOINT\|HF_FINBERT_ENDPOINT" .env.example` returns 3
  </acceptance_criteria>
  <automated>node -e "require('@huggingface/inference')"</automated>
  <done>SDK pinned + env documented</done>
</task>

<task type="auto" tdd="true" id="19-C-01-02">
  <name>Task 2: Write tests/lib/sentiment/finsentllm.test.ts (verbatim from impl-plan)</name>
  <read_first>
    - docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md (lines 833-880 — verbatim test block)
  </read_first>
  <behavior>
    4 tests verbatim from impl-plan lines 847-879:
    - classifyFinGPT returns score ∈ [-1,1] with confidence ∈ [0,1]
    - classifyMistralFin returns same shape
    - classifyFinBERT returns same shape
    - Returns null sentinel on API error (does NOT throw)
  </behavior>
  <action>
    Create `tests/lib/sentiment/finsentllm.test.ts` with EXACT contents from impl-plan lines 833-880. Mock `@huggingface/inference` HfInference class via `vi.mock`. The error sentinel test uses `vi.doMock` with a throwing implementation.
  </action>
  <acceptance_criteria>
    - File exists; ≥4 tests; FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/sentiment/finsentllm.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>4 tests written</done>
</task>

<task type="auto" tdd="true" id="19-C-01-03">
  <name>Task 3: Implement src/lib/sentiment/finsentllm.ts (verbatim from impl-plan)</name>
  <read_first>
    - docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md (lines 891-934 — verbatim impl)
    - tests/lib/sentiment/finsentllm.test.ts
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (Open Question 1 — pin HF model revisions)
  </read_first>
  <action>
    Create `src/lib/sentiment/finsentllm.ts` per impl-plan lines 891-934:
    ```typescript
    import { HfInference } from '@huggingface/inference';

    /**
     * FinSentLLM clients per CONTEXT D-33.
     *
     * IMPORTANT: HF model revision SHAs MUST be pinned in the endpoint URL itself
     * (RESEARCH Open Question 1). Endpoint env vars should look like:
     *   HF_FINGPT_ENDPOINT=https://<id>.aws.endpoints.huggingface.cloud/fingpt-v3@<commit-sha>
     * The implementer MUST verify pinned revisions at deploy time and
     * record the specific revisions in the .env.local for production.
     */
    export interface SentimentScore {
      score: number | null;
      confidence: number | null;
      model: 'fingpt-v3' | 'mistral-fin-7b' | 'finbert';
      error?: string;
    }

    function getClient(): HfInference {
      const token = process.env.HF_INFERENCE_TOKEN;
      if (!token) throw new Error('HF_INFERENCE_TOKEN not set');
      return new HfInference(token);
    }

    function reduceLabels(out: Array<{ label: string; score: number }>): { score: number; confidence: number } {
      let pos = 0, neg = 0, max = 0;
      for (const r of out) {
        const l = r.label.toLowerCase();
        if (l.startsWith('pos')) pos = r.score;
        else if (l.startsWith('neg')) neg = r.score;
        if (r.score > max) max = r.score;
      }
      return { score: pos - neg, confidence: max };
    }

    async function classifyVia(model: SentimentScore['model'], endpointEnv: string, text: string): Promise<SentimentScore> {
      try {
        const endpoint = process.env[endpointEnv];
        if (!endpoint) throw new Error(`${endpointEnv} not set`);
        const client = getClient();
        const out = await client.textClassification({ model: endpoint, inputs: text });
        const arr = Array.isArray(out) ? out : [out];
        const { score, confidence } = reduceLabels(arr as Array<{ label: string; score: number }>);
        return { score, confidence, model };
      } catch (err) {
        // SECURITY: do not log endpoint URL (per T-19-C-01-01)
        const msg = err instanceof Error ? err.message : String(err);
        return { score: null, confidence: null, model, error: msg };
      }
    }

    export const classifyFinGPT     = (text: string) => classifyVia('fingpt-v3',      'HF_FINGPT_ENDPOINT', text);
    export const classifyMistralFin = (text: string) => classifyVia('mistral-fin-7b', 'HF_MISTRAL_FIN_ENDPOINT', text);
    export const classifyFinBERT    = (text: string) => classifyVia('finbert',        'HF_FINBERT_ENDPOINT', text);
    ```

    NOTE TO EXECUTOR: Per RESEARCH §Sources Tertiary, verify @huggingface/inference SDK API (`textClassification` method, `inputs` param) at impl time. Use Context7 if available: `mcp__context7__resolve-library-id @huggingface/inference` then `mcp__context7__get-library-docs` to confirm.
  </action>
  <acceptance_criteria>
    - All 4 tests pass
    - `grep -q "HfInference" src/lib/sentiment/finsentllm.ts`
    - `grep -q "score: null\|score: null" src/lib/sentiment/finsentllm.ts` (null sentinel)
    - `grep -q "TODO\|IMPORTANT.*pin" src/lib/sentiment/finsentllm.ts` (revision-pin reminder per Open Question 1)
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/sentiment/finsentllm.test.ts</automated>
  <done>4/4 GREEN; null sentinel + revision pin docs present</done>
</task>

<task type="auto" id="19-C-01-04">
  <name>Task 4: Document HF endpoint provisioning in SUMMARY (operations work, not code)</name>
  <action>
    The 3 HF Inference Endpoints must be provisioned in HuggingFace Cloud before C-01 shadow phase can produce sane scores. This step IS the operations gap.

    Document in plan SUMMARY:
    - "PENDING (operations): provision 3 HF Inference Endpoints in HF Cloud"
    - "Provisioning checklist: select model (FinGPT v3 / Mistral 7B fin-tuned / FinBERT) → choose AWS region (us-east-1 to match Vercel) → select GPU instance ($0.03/hr base) → enable always-on mode (~$10/mo per endpoint per RESEARCH Assumption A2) → copy endpoint URL with @<commit-sha> revision pin → set as HF_*_ENDPOINT env var via Vercel CLI"
    - "If always-on cost exceeds $10/mo per endpoint, fall back to scale-to-zero with warm-up cron (per RESEARCH Pitfall 4 mitigation 2)"
  </action>
  <acceptance_criteria>
    - SUMMARY.md (when written at plan-end) documents provisioning steps
  </acceptance_criteria>
  <automated>echo "documentation step — verified at SUMMARY write"</automated>
  <done>Provisioning gap documented for ops handoff</done>
</task>

<task type="auto" id="19-C-01-05">
  <name>Task 5: Commit</name>
  <action>
    Commit:
    ```
    feat(19-c-01): FinSentLLM clients (FinGPT v3 + Mistral-Fin 7B + FinBERT)

    Three independent HuggingFace Inference Endpoint clients, each returning
    a uniform SentimentScore. Errors return null sentinels (do not throw).
    @huggingface/inference@4.13.15 pinned.

    Foundation for Plan 19-C-02 (ensemble meta-classifier) and 19-C-08 (CoVe verifier).

    NOTE: 3 HF Inference Endpoints must be provisioned (operations) before
    these clients return non-null scores in production. See SUMMARY for
    provisioning checklist.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-c-01)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-c-01"</automated>
  <done>FinSentLLM clients committed</done>
</task>

</tasks>

<verification>
- [ ] 4 unit tests pass (mocked HF SDK)
- [ ] @huggingface/inference 4.13.15 pinned
- [ ] All 3 client functions return null on error (no throw)
- [ ] Endpoint URLs treated as secrets (never logged)
- [ ] HF model revision pin reminder documented in code comment
</verification>

<success_criteria>
1. classifyFinGPT/classifyMistralFin/classifyFinBERT callable
2. Plan 19-C-02 ensemble can compose these
3. Plan 19-C-08 CoVe can use FinBERT for NLI
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-C-01-SUMMARY.md` with:
- 4 unit tests passing
- Provisioning checklist for 3 HF endpoints
- Pinned model revisions (or PENDING marker if not yet provisioned)
</output>
