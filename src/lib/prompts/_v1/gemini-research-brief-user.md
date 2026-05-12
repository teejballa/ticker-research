---
id: gemini-research-brief-user
version: v1
description: User-message prompt for the main Gemini analysis call. Composes the research brief plus four pre-formatted section strings (news / community sentiment / sentiment intelligence / community intelligence). Each section is built by the caller (buildUserPrompt) so empty sections render as the empty string — preserving the pre-registry concatenation behavior byte-for-byte. The trailing instruction is baked in.
created_at: 2026-05-11T00:00:00Z
deprecated_at: null
variables:
  - brief
  - news_section
  - community_sentiment_section
  - sentiment_intelligence_section
  - community_intelligence_section
---
{{brief}}

{{news_section}}{{community_sentiment_section}}{{sentiment_intelligence_section}}{{community_intelligence_section}}Analyze the ticker based on all research data above. Return the structured analysis.