// src/lib/prompts/client-disclaimers.ts
//
// Client-safe variant of the 20-Z-04 registry for the two disclaimer
// prompts that ResearchReport.tsx renders inside a 'use client' boundary.
//
// Why: the registry's _manifest.ts uses node:fs / node:url / node:path to
// load _vN/<id>.md at module-load time. Webpack refuses to bundle "node:"
// scheme imports for client targets, so any client component that imports
// renderPrompt transitively pulls in node:url and breaks `next build`.
//
// This module mirrors the literal bodies of the disclaimer-footer and
// price-target-hedge prompts as plain string constants. A unit test
// (tests/prompts/client-disclaimers.parity.unit.test.ts) verifies these
// constants stay byte-identical to the source-of-truth markdown files,
// so the S5 "pinned prompt versions" guarantee + 20-D-05's
// `npm run check-disclaimers` CI gate are both preserved.
//
// If you edit either body here, you MUST also bump the corresponding
// _v1/.md file to a _v2/ folder per 20-Z-04 registry rules.

export const DISCLAIMER_FOOTER_V1_BODY =
  'This research is for educational purposes only and does not constitute personalized investment advice, investment recommendation, or solicitation. Past performance does not guarantee future results. Consult a licensed financial advisor before making investment decisions. Data sources current as of {{data_as_of_timestamp}}.';

export const PRICE_TARGET_HEDGE_V1_BODY =
  'Price target reflects analyst consensus or model-implied range as of {{data_as_of_timestamp}}; not a forecast or recommendation. {{ci_band_or_implied_range}}';

/**
 * Tiny client-safe substituter — same semantics as registry/render.ts:
 * - Replaces every {{varname}} occurrence with vars[varname].
 * - Throws on any residual {{...}} after substitution (T-20-Z-04-03 defense).
 * - Throws on any declared-but-unfilled var.
 */
export function applyDisclaimerVars(
  body: string,
  vars: Record<string, string>,
): string {
  let result = body;
  for (const [k, v] of Object.entries(vars)) {
    const placeholder = `{{${k}}}`;
    if (!result.includes(placeholder)) {
      throw new Error(
        `applyDisclaimerVars: variable '${k}' not found in body — did the prompt change?`,
      );
    }
    result = result.split(placeholder).join(v);
  }
  const residual = result.match(/\{\{[^}]+\}\}/);
  if (residual) {
    throw new Error(
      `applyDisclaimerVars: residual placeholder ${residual[0]} after substitution`,
    );
  }
  return result;
}
