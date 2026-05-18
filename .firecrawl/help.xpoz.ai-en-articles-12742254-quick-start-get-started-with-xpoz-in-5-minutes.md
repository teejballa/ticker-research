[Skip to main content](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#main-content)

[![Xpoz Help Center](https://downloads.intercomcdn.com/i/o/c47a99k7/803834/603ff0bb630443644a616b286a7d/995811ba6ae9a6862103bc6bc267de0c.png)](https://help.xpoz.ai/en/)

English

English

English

English

Search for articles...

1. [All Collections](https://help.xpoz.ai/en/)

2. [Getting Started](https://help.xpoz.ai/en/collections/16124756-getting-started)

3. Quick Start: Get Started with XPOZ in 5 Minutes

# Quick Start: Get Started with XPOZ in 5 Minutes

Get started with XPOZ MCP and run your first Twitter analysis in just 5 minutes. This guide will walk you through everything you need to know.

![](https://static.intercomassets.com/avatars/9144211/square_128/FO72F654A4547a21_REV_03-01-1762284091.png)

Written by Xpoz
November 13, 2025

Table of contents

[Step 1: Choose Your First Query 🎯](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_74da02b232)[Step 2: Structure Your Request 📝](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_dc749f920c)[Step 3: Common Query Patterns 🎨](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_674cf91cfa)[Step 4: Understanding the Response ⚡](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_4aec1dda2b)[Step 5: Iterate & Refine 🎓](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_22efa1c881)[Ready to Start? 🎯](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_caa487b6e2)[What's Next?](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_aea344b493)

* * *

Before you start, please make sure to add the Xpoz MCP in [Claude.ai](https://help.xpoz.ai/en/articles/12616835-connecting-xpoz-mcp-with-claude-ai).

## Step 1: Choose Your First Query 🎯

Start with a simple, clear question. XPOZ works best when you're specific about what you want to analyze.

#### Try One of These Starter Queries

**👤 User Analysis**

```
Show me @elonmusk's profile and last 10 tweets
```

**🔍 Topic Search**

```
Find tweets about AI from this week
```

**📊 Trend Tracking**

```
What's trending with #ClimateAction?
```

**💡 Pro Tip**: Include specific details like usernames (with @), date ranges, and metrics you care about. The more specific you are, the better the results.

* * *

## Step 2: Structure Your Request 📝

Use natural language, but include key information that helps XPOZ understand your needs.

#### Good Example

```
Analyze @TeslaMotors tweets from the past 30 days.  Show engagement metrics (retweets, likes, replies)  and identify their top 5 performing tweets.
```

**Why it works:**

\- ✅ Specific account (@TeslaMotors)

\- ✅ Clear time range (30 days)

\- ✅ Defined metrics (engagement)

\- ✅ Specific output (top 5)

#### Basic Example (Could Be Improved)

```
Show me Tesla tweets
```

**Could be improved by adding:**

\- Which account? (@TeslaMotors, @elonmusk, or search all?)

\- Time period? (today, this week, this month?)

\- What metrics? (engagement, reach, sentiment?)

#### Key Elements to Include

**WHO**: Specific usernames or "tweets from anyone"

​ **WHAT**: Keywords, hashtags, or topics

​ **WHEN**: Date ranges or relative time (last week, today)

​ **HOW MANY**: Number of results you want

​ **WHICH METRICS**: Engagement, reach, sentiment, etc.

* * *

## Step 3: Common Query Patterns 🎨

Here are proven patterns you can adapt for your needs:

|     |     |
| --- | --- |
| Goal | Example Query |
| **Profile Analysis** | "Get @username's profile info and their 20 most recent tweets with engagement data" |
| **Topic Research** | "Search for tweets about 'climate change' from verified accounts in the past week" |
| **Hashtag Tracking** | "Find all tweets with #MarketingTips from the past month, sorted by engagement" |
| **Competitor Analysis** | "Compare @Brand1 and @Brand2 posting patterns and engagement over the past 90 days" |
| **Viral Content** | "Get tweet ID 1234567890 and show all its retweets and quote tweets" |
| **Sentiment Analysis** | "Find tweets mentioning @OurBrand from this week and analyze sentiment" |

* * *

## Step 4: Understanding the Response ⚡

XPOZ will return structured data. Here's what you'll typically see:

#### Profile Data

- Username, display name, bio

- Follower counts, verification status

- Account creation date


#### Tweet Data

- Text content and timestamp

- Author information

- Engagement metrics

- Content details (hashtags, mentions, media)


#### Example Response Structure

```
Tweet: "Just launched our new product! 🚀" ├─ Author: @CompanyName (verified ✓) ├─ Posted: 2024-11-04 at 3:24 PM ├─ Retweets: 1,234 ├─ Replies: 456 ├─ Likes: 5,678 ├─ Impressions: 234,567 ├─ Hashtags: #ProductLaunch, #Innovation ├─ Mentions: @PartnerCompany └─ Media: [image_url]
```

**⚠️ Rate Limits & Best Practices**:

\- Request only the data fields you need

\- Use date ranges to limit result sets

\- For large datasets, process in batches

\- Cache results when possible

* * *

## Step 5: Iterate & Refine 🎓

Start broad, then drill down based on what you discover.

#### Example Analysis Flow

**Query 1 (Broad):**

```
Show me tweets about 'electric vehicles' from this month
```

→ Found 50K tweets, noticed Tesla dominates conversation

**Query 2 (Refined):**

```
Get @Tesla's tweets from this month with engagement metrics
```

→ Found their launch announcement got 2M impressions

**Query 3 (Deep Dive):**

```
Get tweet ID [launch_tweet] and all its quote tweets and replies
```

→ Analyzed how the announcement spread through different communities

**Query 4 (Comparative):**

```
Compare Tesla vs Rivian launch announcements and engagement
```

→ Identified what made Tesla's more effective

#### Advanced Tips

- Combine multiple queries to build comprehensive reports

- Export data to spreadsheets for further analysis

- Set up recurring queries for ongoing monitoring

- Use Claude to help interpret patterns and trends

- Cross-reference findings with other data sources


* * *

## Ready to Start? 🎯

Try one of these starter queries right now:

#### 🔰 Beginner

```
Show me @OpenAI's last 10 tweets
```

#### ⚡ Intermediate

```
Find tweets about AI safety from the past week with over 1000 likes
```

#### 🚀 Advanced

```
Compare @Microsoft, @Google, and @Meta's AI-related tweets this quarter
```

* * *

## What's Next?

**Continue Learning:**

\- [20 Sample Prompts to Get You Started](https://help.xpoz.ai/en/articles/12744733-xpoz-mcp-sample-prompts-twitter-x) \- More example queries

\- [Business Use Cases](https://help.xpoz.ai/en/articles/12745423-xpoz-mcp-business-use-cases-examples) \- Real-world applications

​

**Get Help:**

\- Having trouble? Check our [troubleshooting guide](https://help.xpoz.ai/en/collections/16124757-troubleshooting)

​

* * *

**✨ Need More Help?**

Our support team is here to help! Click the chat icon in the bottom right to get personalized assistance.

Did this answer your question?

😞😐😃

Table of contents

[Step 1: Choose Your First Query 🎯](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_74da02b232)[Step 2: Structure Your Request 📝](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_dc749f920c)[Step 3: Common Query Patterns 🎨](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_674cf91cfa)[Step 4: Understanding the Response ⚡](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_4aec1dda2b)[Step 5: Iterate & Refine 🎓](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_22efa1c881)[Ready to Start? 🎯](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_caa487b6e2)[What's Next?](https://help.xpoz.ai/en/articles/12742254-quick-start-get-started-with-xpoz-in-5-minutes#h_aea344b493)

[Xpoz Help Center](https://help.xpoz.ai/en/)

Intercom [We run on Intercom](https://www.intercom.com/intercom-link?company=Xpoz&solution=customer-support&utm_campaign=intercom-link&utm_content=We+run+on+Intercom&utm_medium=help-center&utm_referrer=https%3A%2F%2Fhelp.xpoz.ai%2Fen%2Farticles%2F12742254-quick-start-get-started-with-xpoz-in-5-minutes&utm_source=desktop-web)