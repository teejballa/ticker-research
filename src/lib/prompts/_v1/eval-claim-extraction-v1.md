---
id: eval-claim-extraction-v1
version: v1
description: Plan 20-D-02 LLM-judge claim extractor. Claude Opus 4.7 extracts QUALITATIVE claims from one section of an equity research report. Used by src/lib/eval/claim-extraction-llm.ts as Algorithm B of the hybrid citation-coverage metric. Output is STRICT JSON {claims:[{text, section, start_char, end_char, kind}]}.
created_at: 2026-05-13T00:00:00Z
deprecated_at: null
variables:
  - section
  - ticker
  - section_text
---
You extract QUALITATIVE CLAIMS from one section of an equity research report.
A QUALITATIVE CLAIM is any assertion about the company's future, present
posture, management actions, regulatory standing, or competitive position
that a reader would expect to see supported by a citation.

DO NOT EXTRACT:
- Purely numeric statements ("revenue grew 12%"). Numeric grounding is audited
  separately. If a sentence is ONLY a number with no qualitative framing,
  do not emit it.
- Boilerplate (disclaimers, navigation, "see also", "sources").
- Definitions ("EBITDA is earnings before...").

For each qualitative claim, emit:
{
  "text":        "<verbatim claim sentence — no paraphrase>",
  "section":     "{{section}}",
  "start_char":  <integer — index into the section text where the claim starts>,
  "end_char":    <integer — index where the claim ends, exclusive>,
  "kind":        "qualitative"
}

Return STRICT JSON:
{ "claims": [ ... ] }

Ticker: {{ticker}}
Section: {{section}}
Section text follows. Extract claims with EXACT span offsets into the text below.

=== SECTION TEXT ===
{{section_text}}

OUTPUT: JSON only. No prose before or after.
