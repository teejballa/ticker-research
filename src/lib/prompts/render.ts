// src/lib/prompts/render.ts
// Plan 20-Z-04 — pure renderer for the prompt registry.
//
// Substitutes {{varname}} placeholders with values from `vars`. Throws on:
//  - missing declared variables (PromptVarMissingError)
//  - any unfilled {{...}} placeholder remaining after substitution (defense-in-depth
//    against T-20-Z-04-03 prompt-injection-via-unfilled-vars).
//
// Pure: no fs at request time after manifest load; no env vars; idempotent.

import { getPrompt, type PromptId, type PromptVersion } from './registry';

export class PromptVarMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptVarMissingError';
  }
}

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

/**
 * Render the registered prompt body, substituting {{var}} placeholders from
 * `vars`. Throws PromptVarMissingError if any declared `variables` entry is
 * undefined in `vars`, or if any unfilled `{{…}}` placeholder remains after
 * the substitution pass.
 *
 * When `version` is omitted, the latest non-deprecated version of `id` is used.
 */
export function renderPrompt(
  id: PromptId,
  vars: Readonly<Record<string, string>>,
  version?: PromptVersion,
): string {
  const prompt = getPrompt(id, version);

  // Step 1 — assert every declared required variable is present AND defined.
  // `undefined` values are rejected explicitly so they don't silently turn
  // into the literal string "undefined" via substitution.
  for (const name of prompt.variables) {
    if (!(name in vars) || vars[name] === undefined) {
      throw new PromptVarMissingError(
        `Required variable '${name}' missing for prompt '${prompt.id}@${prompt.version}'. ` +
          `Declared variables: [${prompt.variables.join(', ')}]. Provided keys: [${Object.keys(vars).join(', ')}].`,
      );
    }
  }

  // Step 2 — substitute every {{name}} for which a value exists. Leave
  // unknown placeholders in place (step 3 will catch them).
  const rendered = prompt.template.replace(PLACEHOLDER_RE, (match, name: string) =>
    name in vars && vars[name] !== undefined ? vars[name] : match,
  );

  // Step 3 — defense-in-depth: scan for remaining placeholders. If any leak
  // past substitution it indicates the template body declares a var the
  // `variables` array forgot — fail loud rather than render an injection-y
  // string to Gemini.
  PLACEHOLDER_RE.lastIndex = 0;
  const leftover = PLACEHOLDER_RE.exec(rendered);
  if (leftover) {
    throw new PromptVarMissingError(
      `Unfilled placeholder '{{${leftover[1]}}}' in rendered prompt '${prompt.id}@${prompt.version}' — ` +
        `did you forget to declare it in the registry's variables array?`,
    );
  }

  return rendered;
}
