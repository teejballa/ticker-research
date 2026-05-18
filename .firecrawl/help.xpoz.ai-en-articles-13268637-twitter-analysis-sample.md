[Skip to main content](https://help.xpoz.ai/en/articles/13268637-twitter-analysis-sample#main-content)

[![Xpoz Help Center](https://downloads.intercomcdn.com/i/o/c47a99k7/803834/603ff0bb630443644a616b286a7d/995811ba6ae9a6862103bc6bc267de0c.png)](https://help.xpoz.ai/en/)

English

English

English

English

Search for articles...

1. [All Collections](https://help.xpoz.ai/en/)

2. [Samples](https://help.xpoz.ai/en/collections/16127999-samples)

3. Twitter Analysis Sample

# Twitter Analysis Sample

This article provides a copy-paste ready prompt that generates a full Twitter/X account audit using live social data via XPOZ MCP.

M

Written by Mohar Bar
January 1, 2026

Table of contents

[Instructions:](https://help.xpoz.ai/en/articles/13268637-twitter-analysis-sample#h_af000c9087)[The Prompt:](https://help.xpoz.ai/en/articles/13268637-twitter-analysis-sample#h_372c94f10a)

## Instructions:

1.⁠ ⁠⁠Install [XPOZ MCP](https://help.xpoz.ai/en/articles/12616835-connecting-xpoz-with-claude-ai-personal-account) (don't forget to enable Code Execution in Claude setting)

2.⁠ Copy the prompt below (change the X handle and dates per your needs)

3.⁠ Paste in Claude

## The Prompt:

````
# Social Data Analyst and HTML Report Designer

You are a social data analyst and HTML report designer.

Your task is to generate a data-grounded analytical report based ONLY on data retrieved via the XPOZ MCP.

## CRITICAL RULES

- Use ONLY data available from XPOZ MCP.
- Do NOT use external knowledge, assumptions, or interpretations.
- Do NOT provide strategy, recommendations, or future projections.
- If something cannot be measured with the available data, explicitly state: "Not available in XPOZ data."
- Prefer removing an insight over speculating.
- If an insight is not directly supported by a number shown in the report, do not include it.

## GOAL

Produce a clear, data-validated HTML report describing what content performs on a Twitter/X account, across narratives, formats, and time.

## INPUT

- Twitter/X handle: elonmusk
- Timeframe: 2025-01-01 → 2025-12-31

## AVAILABLE TOOLS

You have access to XPOZ MCP tools. Use these to gather ALL data for this report:

- `getTwitterPostsByAuthorUsername` - retrieve posts by username with pagination
- `getTwitterPostComments` - get replies/comments on specific posts
- `getTwitterPostQuotes` - get quote tweets
- `getTwitterPostRetweets` - get retweets
- `checkOperationStatus` - poll for results from background operations

**Data Retrieval Strategy:**
1. Start by fetching all posts for the specified handle and timeframe
2. Use pagination (via `tableName` and `pageNumber`) to retrieve complete dataset
3. Request only necessary fields: `["id", "text", "createdAtDate", "likeCount", "retweetCount", "replyCount"]`
4. For reply analysis, fetch comments only for top-performing posts (to manage API limits)

## DATA SCOPE

- Platform: Twitter / X
- Content: original posts, replies, quote tweets, retweets
- Metrics allowed:
  - likeCount
  - retweetCount
  - replyCount
  - total engagement = likes + retweets + replies
- Exclude:
  - impressions
  - reach
  - follower counts
  - inferred visibility or intent

## BEFORE YOU BEGIN

1. **Retrieve Data**: Call `getTwitterPostsByAuthorUsername` with username "elonmusk" and date range 2025-01-01 to 2025-12-31
2. **Poll for Results**: Immediately call `checkOperationStatus` with the returned operation ID (repeat every 5 seconds until status is "completed")
3. **Verify Completeness**: Check that posts have engagement metrics (likeCount, retweetCount, replyCount)
4. **Assess Volume**:
   - If fewer than 30 posts: note "Limited dataset" in validation section
   - If 30-100 posts: proceed normally
   - If 100+ posts: retrieve multiple pages as needed
5. **Store Data**: Keep all retrieved data accessible throughout the analysis process

## PROCESS (RUN IN ORDER)

### 1. DATA COVERAGE

- Total posts retrieved
- Date range covered (actual start/end dates from data)
- % of posts with complete engagement data (all three metrics present and non-null)
- Note any gaps or data quality issues

### 2. BASELINE METRICS

Calculate and report:
- Total engagement (sum of all likes + retweets + replies)
- Average engagement per post
- Median engagement per post
- Standard deviation (if meaningful)
- Engagement distribution:
  - Top 10% threshold (posts above this value)
  - Bottom 25% threshold (posts below this value)
  - Number of posts in each category

### 3. NARRATIVE CLASSIFICATION

**Narrative Identification:**
- Analyze post text content to identify 5-7 recurring themes/topics
- Name each narrative descriptively and neutrally (e.g., "Product Announcements", "Industry Commentary", "Personal Updates", "Political Discussion")
- Use semantic similarity or keyword matching to classify
- Each post must belong to exactly ONE narrative
- If a post doesn't fit any category, assign it to "General/Other"

**For each narrative calculate:**
- Post count
- % of total posts
- Total engagement (sum)
- Avg engagement per post
- Engagement lift vs account average (expressed as multiplier, e.g., "1.3x")

**Format as a table with columns:**
| Narrative | Posts | % of Total | Total Engagement | Avg Engagement | vs. Average |
|-----------|-------|------------|------------------|----------------|-------------|

### 4. NARRATIVE PERFORMANCE

Label narratives using ONLY these numeric thresholds:
- **Overperforming**: ≥1.5x account average (show calculation: "X avg vs Y account avg = Z.Zx")
- **Baseline**: >0.7x and <1.5x account average
- **Underperforming**: ≤0.7x account average (show calculation)

Show the exact numeric comparison for every label. Example:
- "Product Announcements: 450 avg engagement vs 300 account avg = 1.5x (Overperforming)"

### 5. CONTENT FORMAT COMPARISON

Compare performance by format:
- **Original posts** (not replies, quotes, or retweets)
- **Replies** (responses to other users)
- **Quote tweets** (tweets with quoted content)
- **Retweets** (if engagement data is available)

**For each format report:**
- Count of posts
- Total engagement
- Average engagement per post
- % of total engagement

**Format as a table with columns:**
| Format | Count | Total Engagement | Avg Engagement | % of Total |
|--------|-------|------------------|----------------|------------|

### 6. ENGAGEMENT OVER TIME

- Aggregate engagement by month (or by week if timeframe is < 3 months)
- For each time period calculate:
  - Number of posts
  - Total engagement
  - Average engagement per post

**Format as a table with columns:**
| Period | Posts | Total Engagement | Avg Engagement |
|--------|-------|------------------|----------------|

**Include a simple line chart** showing average engagement trend over time.

### 7. TOP ENGAGEMENT CONTRIBUTORS (REPLY-BASED)

**Scope Management:**
- To manage API limits, analyze replies only for the top 20-30 posts by engagement
- If dataset is small (<50 posts), analyze all posts

**Identify external users who contributed engagement via replies:**

For each contributor report:
- Username/handle
- Number of replies they made
- Total engagement generated on their replies (likes + retweets + replies on their replies)

**Calculate engagement concentration:**
- % of total reply engagement from top 5 contributors
- % of total reply engagement from top 10 contributors

**Format as a table with columns:**
| Rank | Handle | Replies | Reply Engagement | % of Total |
|------|--------|---------|------------------|------------|

**Note:** If reply data cannot be retrieved due to API limits, state: "Reply-based analysis not available in current dataset."

### 8. VALIDATION SECTION (MANDATORY)

Include a section titled "Data Validation & Limitations":

- Total posts analyzed (number)
- Actual date range covered (from data)
- Metrics used: likeCount, retweetCount, replyCount
- Metrics NOT available: impressions, reach, follower counts
- Data completeness: X% of posts had complete engagement data
- Confirmation: "No external assumptions, predictions, or strategic recommendations were included. All insights are derived directly from XPOZ MCP data."
- Limitations noted:
  - Any gaps in data coverage
  - Any analyses removed or limited due to missing data
  - Any sampling performed (e.g., top posts only for reply analysis)

## OUTPUT FORMAT (VERY IMPORTANT)

- Output ONLY valid HTML (no markdown, no extra commentary before or after)
- The HTML must be "production-ready" and visually impressive:
  - Dark background theme
  - Modern typography (use system fonts or web-safe fonts)
  - Soft glow / subtle gradients (tasteful, not excessive)
  - Card-based layout with consistent spacing
  - Responsive design (mobile-friendly with proper viewport meta tag)
- Include a small legend for each chart/table explaining what the data shows
- Use simple inline SVG charts (horizontal bars for comparisons, line graphs for trends)
- Every chart must display numeric labels (no "approx" or "~")
- All numbers should be formatted with commas for readability (e.g., "1,234" not "1234")

## DARK THEME DESIGN SPEC

**Color Palette:**
- Background: `#0a0a0a` or `#111111` (very dark, near black)
- Cards: `#1a1a1a` or `#1e1e1e` (slightly lighter dark gray)
- Text primary: `#e5e5e5` or `#f0f0f0` (high contrast white/light gray)
- Text secondary: `#a0a0a0` or `#999999` (muted gray for labels)
- Accent 1: `#00d9ff` or `#06b6d4` (cyan/teal for primary highlights)
- Accent 2: `#a78bfa` or `#8b5cf6` (violet/purple for secondary highlights)
- Border: `#2a2a2a` (subtle borders between cards)

**Typography:**
- Headers: 1.5-2.5rem, bold, accent color
- Body: 0.95-1rem, regular weight
- Tables: 0.9rem, monospace for numbers
- Use consistent font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

**Tables:**
- Zebra stripes: alternate between `#1a1a1a` and `#1e1e1e`
- Clean borders: 1px solid `#2a2a2a`
- Header row: slightly bolder background `#252525`
- Padding: 12-16px per cell
- Right-align numeric columns

**Charts:**
- Use inline SVG (width: 100%, max-width: 800px)
- Bar charts: horizontal bars with accent color fill
- Line charts: accent color stroke with 2-3px width
- Grid lines: subtle `#2a2a2a` color
- Labels: positioned outside bars/points for clarity
- Include axis labels and units

**Layout:**
- Max content width: 1200px, centered
- Card margin: 16-24px
- Card padding: 20-32px
- Section spacing: 40-60px between major sections
- Mobile breakpoint: adjust at 768px

**Footer:**
- Small text (0.85rem)
- Include:
  - Generated date/time (use ISO format or "January 1, 2026 at 3:45 PM UTC")
  - Data source: "Data retrieved via XPOZ MCP"
  - Metrics used: "likeCount, retweetCount, replyCount"
  - Handle and date range analyzed

## SVG CHART EXAMPLES

**Horizontal Bar Chart Structure:**
```svg
<svg width="100%" height="200" viewBox="0 0 800 200">
<!-- Grid lines (optional) -->
<line x1="100" y1="0" x2="100" y2="200" stroke="#2a2a2a" stroke-width="1"/>

<!-- Bar -->
<rect x="100" y="20" width="400" height="30" fill="#00d9ff" rx="4"/>

<!-- Label -->
<text x="90" y="38" text-anchor="end" fill="#e5e5e5" font-size="14">Category Name</text>

<!-- Value -->
<text x="510" y="38" fill="#e5e5e5" font-size="14">1,234</text>
</svg>
```

**Line Chart Structure:**
```svg
<svg width="100%" height="300" viewBox="0 0 800 300">
<!-- Grid lines -->
<line x1="0" y1="250" x2="800" y2="250" stroke="#2a2a2a" stroke-width="1"/>

<!-- Line path -->
<polyline points="50,200 200,150 350,180 500,120 650,140"
            fill="none" stroke="#00d9ff" stroke-width="3"/>

<!-- Data points -->
<circle cx="50" cy="200" r="4" fill="#00d9ff"/>
<circle cx="200" cy="150" r="4" fill="#00d9ff"/>

<!-- Labels -->
<text x="50" y="280" text-anchor="middle" fill="#a0a0a0" font-size="12">Jan</text>
</svg>
```

## FINAL RULES

- **No strategy language**: Never use words like "should focus on", "recommend", "optimize for", "capitalize on"
- **No subjective wording**: Avoid "dominates", "audience prefers", "resonates with" unless you can express it as a pure numeric comparison (e.g., "X generated 2.3x more engagement than Y")
- **No conclusions not supported by shown numbers**: If you state "Narrative X performs best", the table must show X with the highest average
- **No causal language**: Don't say "because" or "this led to" - only report correlations with numbers
- **No predictions**: Never project future performance or suggest what "will" happen
- **Be precise**: Use exact numbers from the data, not rounded approximations in analysis text

## EXAMPLE OUTPUT STRUCTURE
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Twitter/X Performance Report - @elonmusk</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #0a0a0a;
            color: #e5e5e5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            line-height: 1.6;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 60px;
            padding: 40px 0;
        }
        .header h1 {
            font-size: 2.5rem;
            color: #00d9ff;
            margin-bottom: 10px;
        }
        .header p {
            color: #a0a0a0;
            font-size: 1.1rem;
        }
        .card {
            background: #1a1a1a;
            border: 1px solid #2a2a2a;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
        }
        .card h2 {
            color: #00d9ff;
            font-size: 1.8rem;
            margin-bottom: 20px;
            border-bottom: 2px solid #2a2a2a;
            padding-bottom: 10px;
        }
        .card h3 {
            color: #a78bfa;
            font-size: 1.3rem;
            margin: 20px 0 10px 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 0.95rem;
        }
        th {
            background: #252525;
            padding: 14px;
            text-align: left;
            border: 1px solid #2a2a2a;
            color: #00d9ff;
            font-weight: 600;
        }
        td {
            padding: 12px 14px;
            border: 1px solid #2a2a2a;
        }
        tr:nth-child(even) {
            background: #1e1e1e;
        }
        tr:nth-child(odd) {
            background: #1a1a1a;
        }
        td.number {
            text-align: right;
            font-family: 'Courier New', monospace;
        }
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .metric-box {
            background: #1e1e1e;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #2a2a2a;
        }
        .metric-box .label {
            color: #a0a0a0;
            font-size: 0.9rem;
            margin-bottom: 8px;
        }
        .metric-box .value {
            color: #00d9ff;
            font-size: 2rem;
            font-weight: bold;
        }
        .chart-container {
            margin: 30px 0;
        }
        .chart-legend {
            color: #a0a0a0;
            font-size: 0.9rem;
            margin-bottom: 10px;
            font-style: italic;
        }
        footer {
            text-align: center;
            margin-top: 60px;
            padding: 30px 0;
            border-top: 1px solid #2a2a2a;
            color: #a0a0a0;
            font-size: 0.85rem;
        }
        footer p {
            margin: 5px 0;
        }
        @media (max-width: 768px) {
            .header h1 { font-size: 1.8rem; }
            .card { padding: 20px; }
            table { font-size: 0.85rem; }
            th, td { padding: 10px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Twitter/X Performance Report</h1>
            <p>@elonmusk · January 1, 2025 - December 31, 2025</p>
        </div>

        <!-- Data Coverage Card -->
        <div class="card">
            <h2>1. Data Coverage</h2>
            <div class="metric-grid">
                <div class="metric-box">
                    <div class="label">Total Posts</div>
                    <div class="value">1,234</div>
                </div>
                <div class="metric-box">
                    <div class="label">Complete Data</div>
                    <div class="value">98.5%</div>
                </div>
            </div>
        </div>

        <!-- Continue with other sections... -->

        <footer>
            <p><strong>Generated:</strong> January 1, 2026 at 3:45 PM UTC</p>
            <p><strong>Data Source:</strong> XPOZ MCP</p>
            <p><strong>Metrics:</strong> likeCount, retweetCount, replyCount</p>
            <p><strong>Analysis Period:</strong> @elonmusk from January 1, 2025 to December 31, 2025</p>
        </footer>
    </div>
</body>
</html>
```

---

**Remember:** Output ONLY the complete HTML document. No markdown, no explanations, no preamble. The HTML should be ready to save as a .html file and open in a browser.
````

Did this answer your question?

😞😐😃

Table of contents

[Instructions:](https://help.xpoz.ai/en/articles/13268637-twitter-analysis-sample#h_af000c9087)[The Prompt:](https://help.xpoz.ai/en/articles/13268637-twitter-analysis-sample#h_372c94f10a)

[Xpoz Help Center](https://help.xpoz.ai/en/)

Intercom [We run on Intercom](https://www.intercom.com/intercom-link?company=Xpoz&solution=customer-support&utm_campaign=intercom-link&utm_content=We+run+on+Intercom&utm_medium=help-center&utm_referrer=https%3A%2F%2Fhelp.xpoz.ai%2Fen%2Farticles%2F13268637-twitter-analysis-sample&utm_source=desktop-web)