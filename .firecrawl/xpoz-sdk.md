[Skip to main content](https://www.xpoz.ai/sdk/#main)

[![Xpoz](https://www.xpoz.ai/assets/xpoz_logo--bm9skPt.png)](https://www.xpoz.ai/) [Install](https://www.xpoz.ai/sdk/#install) [FAQ](https://www.xpoz.ai/sdk/#faq) [Use Cases](https://www.xpoz.ai/use-cases) [Apps](https://www.xpoz.ai/apps) [SDK](https://www.xpoz.ai/sdk) [Blog](https://www.xpoz.ai/blog) [About](https://www.xpoz.ai/about) [Pricing](https://www.xpoz.ai/pricing) [Help](https://help.xpoz.ai/) [Sign In](https://www.xpoz.ai/login)

Now available on npm & PyPI

# Social data. Typed.

Query Twitter, Instagram, and Reddit with 30 typed methods. Pagination, CSV export, and structured models — all in a single package.

$npm install @xpoz/xpoz$pip install xpoz

[TypeScript](https://github.com/XPOZpublic/xpoz-ts-sdk)· [Python](https://github.com/XPOZpublic/xpoz-python-sdk)\| [Get API Key](https://www.xpoz.ai/get-token)

## Quickstart

TypeScriptPython

```
import { XpozClient } from "@xpoz/xpoz";

const client = new XpozClient({ apiKey: process.env.XPOZ_API_KEY });
await client.connect();

const results = await client.twitter.searchPosts("artificial intelligence");

console.log(`Found ${results.pagination.totalRows} tweets`);
console.log(`Page 1: ${results.data.length} results`);

await client.close();
```

Copy

Full API reference on [GitHub](https://github.com/XPOZpublic/xpoz-ts-sdk)

## Platform Coverage

30 typed methods across three major platforms — consistent interface, structured output

### Twitter / X

12 methods

- Search tweets & users
- Get user timelines
- Track hashtags
- Follower analysis

### Instagram

9 methods

- Search posts & reels
- Profile analytics
- Hashtag tracking
- Engagement metrics

### Reddit

9 methods

- Search posts & comments
- Subreddit analysis
- User history
- Thread deep-dives

## Real-World Examples

Common workflows you can build in minutes

TypeScriptPython

### Brand Monitoring

Track mentions across platforms and analyze sentiment in real time.

```
const results = await client.twitter.searchPosts(
  "YourBrand OR @YourBrand"
);

const highEngagement = results.data.filter(
  (t) => t.likeCount > 100 || t.retweetCount > 50
);

const csvUrl = await results.exportCsv();
console.log(`Download CSV: ${csvUrl}`);
```

Copy

### Influencer Discovery

Find niche influencers by topic and engagement metrics.

```
const results = await client.instagram.searchPosts(
  "sustainable fashion"
);

const usernames = [...new Set(results.data.map((p) => p.username))];

const profiles = await Promise.all(
  usernames.slice(0, 20).map((u) =>
    client.instagram.getUser(u)
  ),
);

const micro = profiles
  .filter((u) => u.followerCount > 10_000 && u.followerCount < 100_000)
  .sort((a, b) => b.followerCount - a.followerCount);
```

Copy

### Competitor Analysis

Compare engagement and content strategy across competitors.

```
const competitors = ["CompetitorA", "CompetitorB"];

const results = await Promise.all(
  competitors.map((handle) =>
    client.twitter.getPostsByAuthor(handle)
  ),
);

const stats = results.map((r, i) => ({
  name: competitors[i],
  avgLikes: r.data.reduce((s, t) => s + t.likeCount, 0) / r.data.length,
  avgRetweets: r.data.reduce((s, t) => s + t.retweetCount, 0) / r.data.length,
}));
```

Copy

### Reddit Research

Mine subreddit discussions for product feedback and trends.

```
const results = await client.reddit.searchPosts(
  "project management tools",
  { subreddit: "productivity" },
);

const threads = await Promise.all(
  results.data.slice(0, 10).map((t) =>
    client.reddit.getPostWithComments(t.id)
  ),
);

const allComments = threads.flatMap((t) => t.comments);
console.log(`${allComments.length} comments collected`);

const csvUrl = await results.exportCsv();
```

Copy

Agent-Ready

## Built for Headless Agents

The SDK works in any headless loop — cron jobs, CI pipelines, or autonomous AI agents. No browser, no OAuth dance, just an API key and typed methods.

- Stateless — no session to manage
- Typed responses — parse without guessing
- Built-in pagination — fetch all results automatically
- CSV export — pipe data anywhere

TypeScriptPython

```
import { XpozClient } from "@xpoz/xpoz";

const client = new XpozClient({ apiKey: process.env.XPOZ_API_KEY });
await client.connect();

async function monitorLoop() {
  const results = await client.twitter.searchPosts(
    "your brand -is:retweet"
  );

  for (const tweet of results.data) {
    if (tweet.likeCount > 1000) {
      await alertTeam(tweet);
    }
  }
}
```

Copy

## Start Querying in 4 Steps

1

### Sign up

Create a free account

2

### Get API key

Generate from your dashboard

3

### Install

npm install or pip install

4

### Query

30 methods, 3 platforms

[Get Your API Key](https://www.xpoz.ai/get-token) [View on GitHub](https://github.com/XPOZpublic)

### Product

- [Features](https://www.xpoz.ai/#features)
- [Installation](https://www.xpoz.ai/#install)
- [Examples](https://www.xpoz.ai/#examples)
- [Use Cases](https://www.xpoz.ai/use-cases)
- [Apps](https://www.xpoz.ai/apps)
- [SDK](https://www.xpoz.ai/sdk)
- [Documentation](https://help.xpoz.ai/)

### Solutions

- [Brand Monitoring API](https://www.xpoz.ai/brand-monitoring-api)
- [Lead Generation API](https://www.xpoz.ai/lead-generation-api)
- [Social Listening API](https://www.xpoz.ai/social-listening-api)
- [Social Media Monitoring](https://www.xpoz.ai/social-media-monitoring-api)
- [Social Data API](https://www.xpoz.ai/social-data-api)
- [Competitive Intelligence](https://www.xpoz.ai/competitive-intelligence-api)

### Resources

- [GitHub](https://github.com/XPOZpublic)
- [FAQ](https://www.xpoz.ai/#faq)
- [Blog](https://www.xpoz.ai/blog)
- [Claude Code](https://www.xpoz.ai/integrations/claude-code)
- [Codex](https://www.xpoz.ai/integrations/codex)
- [Gemini CLI](https://www.xpoz.ai/integrations/gemini-cli)

### Community

- [LinkedIn](https://linkedin.com/company/xpozinc/)
- [Twitter](https://x.com/XPOZAI)
- [YouTube](https://www.youtube.com/@XPOZ-v1k)

### Company

- [About](https://www.xpoz.ai/about)
- [Contact](mailto:support@xpoz.ai)
- [Privacy](https://www.xpoz.ai/privacy)
- [Terms](https://www.xpoz.ai/terms)

© 2026 Xpoz. Built with ❤️ for the AI community.