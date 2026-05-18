[Skip to main content](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#main-content)

[![Xpoz Help Center](https://downloads.intercomcdn.com/i/o/c47a99k7/803834/603ff0bb630443644a616b286a7d/995811ba6ae9a6862103bc6bc267de0c.png)](https://help.xpoz.ai/en/)

English

English

English

English

Search for articles...

1. [All Collections](https://help.xpoz.ai/en/)

2. [FAQs](https://help.xpoz.ai/en/collections/16124760-faqs)

3. Which Tools are Available?

# Which Tools are Available?

All the tools that the MPC provides to AI models

![](https://static.intercomassets.com/avatars/9144211/square_128/FO72F654A4547a21_REV_03-01-1762284091.png)

Written by Xpoz
December 28, 2025

Table of contents

[🛠️](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_f367a4fa20)[Available Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_92c0cfa5c2)[User Information Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_f65551be0a)[Network & Connections Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_c5bfb2c043)[Posts & Tweets Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_5ffac16920)[Engagement & Interaction Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_b4c04a0311)[User Discovery Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_9be2940c08)[Utility Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_82e95193aa)[Available Data Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_42a031bc80)[Twitter User Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_4fa982fb24)[Twitter Post Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_6ad511b3a6)[Twitter User Discovery Aggregate Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_ee7883fc11)[Available Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_0e37645064)[User Information Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_7e0c2a9ea5)[Network & Connections Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_b70fc265a4)[Post Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_672024a43d)[Engagement Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_54cfa705c3)[User Discovery Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_7246cc6ad7)[Utility Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_078b20795c)[Available Data Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_f5cd07a203)[Instagram User Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_dbf5e39d0e)[Instagram Post Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_33bf71493a)[Instagram Comment Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_68109a8b70)[Instagram User Discovery Aggregate Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_cba9b51855)[Key Features & Capabilities](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_6e7ad33c03)[Performance Optimization](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_d50c11af4b)[Pagination & Data Export](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_923d14b8f9)[Search & Query Features](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_51dace9cce)[Batch Operations](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_ae806effcb)

# 🐦 XPOZ MCP - **Twitter/X** Tools Reference

Access comprehensive Twitter/X data through XPOZ Model Context Protocol (MCP) without managing API keys.

* * *

## 🛠️

# **Available Tools**

👤

## **User Information Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `getTwitterUserByUsername` | Get detailed profile information for any Twitter user by their **exact** username |
| `getTwitterUserById` | Get profile information using a Twitter user ID |
| `searchTwitterUsers` | Find Twitter users by searching names, partial usernames, or fuzzy matching |

* * *

🔗

## **Network & Connections Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `getTwitterFollowers` | Get all users who follow a specific user (server-side pagination, 1000 per page) |
| `getTwitterFollowing` | Get all users that a specific user follows (server-side pagination, 1000 per page) |

* * *

📝

## **Posts & Tweets Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `getTwitterPostsByIds` | Retrieve multiple specific tweets (1-100 at once) by their tweet IDs - **batch operation** |
| `getTwitterPostsByAuthorUsername` | Get all tweets from a specific user by their username (server-side pagination, 100 per page) |
| `getTwitterPostsByAuthorId` | Get all tweets from a specific user by their user ID (server-side pagination, 100 per page) |
| `getTwitterPostsByKeywords` | Search for tweets matching specific keywords or phrases (server-side pagination, 100 per page) |
| `countTweets` | Count how many tweets match a phrase within a date range (analytics) |

* * *

💬

## **Engagement & Interaction Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `getTwitterPostComments` | Get all replies to a specific tweet (server-side pagination, 100 per page) |
| `getTwitterPostQuotes` | Get all quote tweets of a specific tweet (server-side pagination, 100 per page) |
| `getTwitterPostRetweets` | Get all retweets of a specific tweet (server-side pagination, 100 per page) |
| `getTwitterPostInteractingUsers` | Get user profiles of people who commented/quoted/retweeted a post (server-side pagination, 1000 per page) |

* * *

🔍

## **User Discovery Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `getTwitterUsersByKeywords` | Find users who have posted content about specific topics/keywords - returns unique user profiles with aggregate engagement metrics (server-side pagination) |

* * *

🛠️

## **Utility Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `checkAccessKeyStatus` | Verify your API access status and usage limits |
| `getUserAccessKey` | Retrieve your access key (requires confirmation) |
| `checkOperationStatus` | **Critical:** Monitor long-running operations and retrieve results. Must be called immediately after any tool that returns an operation ID. |
| `cancelOperation` | Cancel an operation in progress |

* * *

🎯

## **Available Data Fields**

## **Twitter User Fields**

|     |     |
| --- | --- |
| **Category** | **Fields** |
| **Core** | `id`, `username`, `name`, `description`, `location`, `verified`, `verifiedType`, `protected` |
| **Engagement** | `followersCount`, `followingCount`, `tweetCount`, `listedCount`, `likesCount`, `mediaCount` |
| **Profile** | `profileImageUrl`, `profileBannerUrl`, `profileInterstitialType` |
| **Analytics** | `collectedFollowingCount`, `collectedFollowersCount`, `collectedFollowersCoverage`, `collectedFollowingCoverage`, `avgTweetsPerDayLastMonth` |
| **Advanced** | `inauthenticType`, `isInauthentic`, `isInauthenticProbScore`, `nLang`, `nLangsFiltered` |
| **Timestamps** | `createdAt`, `modifiedAt`, `xFetchedAt`, `xModifiedAt` |
| **Account History** | `verifiedSinceDatetime`, `usernameChanges`, `lastUsernameChangeDatetime` |

## **Twitter Post Fields**

|     |     |
| --- | --- |
| **Category** | **Fields** |
| **Core** | `id`, `text`, `authorId`, `authorUsername`, `createdAt`, `createdAtDate` |
| **Engagement** | `retweetCount`, `replyCount`, `likeCount`, `quoteCount`, `impressionCount`, `bookmarkCount` |
| **Metadata** | `lang`, `possiblySensitive`, `suspended`, `deleted`, `source` |
| **Relations** | `conversationId`, `quotedTweetId`, `retweetedTweetId` |
| **Content** | `hashtags`, `mentions`, `mediaUrls` |
| **Location** | `country`, `region`, `city` |

## **Twitter User Discovery Aggregate Fields**

|     |     |
| --- | --- |
| **Category** | **Fields** |
| **Aggregations** | `aggRelevance`, `relevantTweetsCount`, `relevantTweetsImpressionsSum`, `relevantTweetsLikesSum`, `relevantTweetsQuotesSum`, `relevantTweetsRepliesSum`, `relevantTweetsRetweetsSum` |

_Note: Aggregate fields are only available with getTwitterUsersByKeywords and must be explicitly requested in the fields parameter._

* * *

# 📸 XPOZ MCP - **Instagram** Tools Reference

Access comprehensive Instagram data through XPOZ Model Context Protocol (MCP) without managing API keys.

* * *

🛠️

# **Available Tools**

👤

## **User Information Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `getInstagramUserByUsername` | Get detailed profile information for any Instagram user by their **exact** username |
| `getInstagramUserById` | Get profile information using an Instagram user ID |
| `searchInstagramUsers` | Find Instagram users by searching names, partial usernames, or fuzzy matching |

* * *

🔗

## **Network & Connections Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `getInstagramFollowers` | Get all users who follow a specific user (server-side pagination, 100 per page) |
| `getInstagramFollowing` | Get all users that a specific user follows (server-side pagination, 100 per page) |

* * *

📷

## **Post Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `getInstagramPostsByIds` | Retrieve multiple specific Instagram posts (1-100 at once) by their post IDs - **batch operation** |
| `getInstagramPostsByUserId` | Get all posts from a specific user by their user ID (server-side pagination, 100 per page) |
| `getInstagramPostsByUsername` | Get all posts from a specific user by their username (server-side pagination, 100 per page) |
| `getInstagramPostsByKeywords` | Search for posts matching specific keywords or hashtags (server-side pagination, 100 per page) |

* * *

💬

## **Engagement Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `getInstagramCommentsByPostId` | Get all comments on a specific Instagram post (server-side pagination, 100 per page) |
| `getInstagramPostInteractingUsers` | Get user profiles of people who commented on or liked a post (server-side pagination, 1000 per page) |

* * *

🔍

## **User Discovery Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `getInstagramUsersByKeywords` | Find users who have posted content about specific topics/keywords - returns unique user profiles with aggregate engagement metrics (server-side pagination) |

* * *

🛠️

## **Utility Tools**

|     |     |
| --- | --- |
| **Tool Name** | **What It Does** |
| `checkAccessKeyStatus` | Verify your API access status and usage limits |
| `getUserAccessKey` | Retrieve your access key (requires confirmation) |
| `checkOperationStatus` | **Critical:** Monitor long-running operations and retrieve results. Must be called immediately after any tool that returns an operation ID. |
| `cancelOperation` | Cancel an operation in progress |

* * *

🎯

## **Available Data Fields**

## **Instagram User Fields**

|     |     |
| --- | --- |
| **Category** | **Fields** |
| **Core** | `id`, `username`, `fullName`, `biography`, `isPrivate`, `isVerified` |
| **Engagement** | `followerCount`, `followingCount`, `mediaCount` |
| **Profile** | `profilePicUrl`, `profilePicId`, `profileUrl`, `externalUrl`, `hasAnonymousProfilePicture` |
| **Timestamps** | `lastFetch`, `lastFetchDatetime`, `xLastUpdated` |

## **Instagram Post Fields**

|     |     |
| --- | --- |
| **Category** | **Fields** |
| **Core** | `id`, `postType`, `userId`, `username`, `fullName`, `caption`, `createdAt`, `createdAtTimestamp`, `createdAtDate` |
| **Engagement** | `likeCount`, `commentCount`, `reshareCount`, `videoPlayCount` |
| **Media** | `mediaType`, `codeUrl`, `imageUrl`, `videoUrl`, `audioOnlyUrl`, `profilePicUrl`, `videoSubtitlesUri`, `videoDuration` |

## **Instagram Comment Fields**

|     |     |
| --- | --- |
| **Category** | **Fields** |
| **Core** | `id`, `text`, `parentPostId`, `type`, `parentCommentId`, `repliedToCommentId`, `childCommentCount` |
| **User** | `userId`, `username`, `fullName` |
| **Engagement** | `likeCount` |
| **Meta** | `createdAt`, `createdAtTimestamp`, `createdAtDate`, `status`, `isSpam`, `hasTranslation` |

## **Instagram User Discovery Aggregate Fields**

|     |     |
| --- | --- |
| **Category** | **Fields** |
| **Aggregations** | `aggRelevance`, `relevantPostsCount`, `relevantPostsLikesSum`, `relevantPostsCommentsSum`, `relevantPostsResharesSum`, `relevantPostsVideoPlaysSum` |

_Note: Aggregate fields are only available with getInstagramUsersByKeywords and must be explicitly requested in the fields parameter._

* * *

✨

# **Key Features & Capabilities**

## **Performance Optimization**

- **Field Selection:** All tools support optional `fields` parameter to request only the data you need

- **Smart Caching:** Automatic data freshness checks (typically >1 week triggers refresh)

- **Force Latest:** Use `forceLatest=true` parameter sparingly to bypass cache for real-time data


## **Pagination & Data Export**

- **Server-Side Pagination:** Most tools support 100-1,000 results per page depending on field selection

- **CSV Export:** All paginated queries include `dataDumpExportOperationId` for downloading complete datasets as CSV files

- **Bulk Page Fetch:** Use `pageNumberEnd` with `pageNumber` to fetch multiple consecutive pages at once

- **Table Caching:** First call creates cached table, subsequent pages use `tableName` parameter


## **Search & Query Features**

- **Exact Phrase Matching:** Use double quotes for exact matches (e.g., `"artificial intelligence"`)

- **Boolean Operators:** Support for AND/OR/NOT operators with parentheses for complex queries

- **Date Filtering:** Most tools support `startDate` and `endDate` parameters (YYYY-MM-DD format)

- **Language Filtering:** Filter content by language code where applicable


## **Batch Operations**

- **Multiple IDs:**`getTwitterPostsByIds` and `getInstagramPostsByIds` support 1-100 IDs per request

- **Parallel Processing:** Batch operations parallelize database queries and API calls for maximum efficiency

- **Graceful Handling:** Returns only found items, omitting not-found IDs for flexibility


**⚠️ Important:** All tools return operation IDs that require **immediate** use of `checkOperationStatus` to retrieve actual results. Results are ONLY available via `checkOperationStatus` \- do not try other tools or wait for user prompt.

Did this answer your question?

😞😐😃

Table of contents

[🛠️](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_f367a4fa20)[Available Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_92c0cfa5c2)[User Information Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_f65551be0a)[Network & Connections Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_c5bfb2c043)[Posts & Tweets Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_5ffac16920)[Engagement & Interaction Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_b4c04a0311)[User Discovery Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_9be2940c08)[Utility Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_82e95193aa)[Available Data Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_42a031bc80)[Twitter User Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_4fa982fb24)[Twitter Post Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_6ad511b3a6)[Twitter User Discovery Aggregate Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_ee7883fc11)[Available Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_0e37645064)[User Information Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_7e0c2a9ea5)[Network & Connections Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_b70fc265a4)[Post Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_672024a43d)[Engagement Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_54cfa705c3)[User Discovery Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_7246cc6ad7)[Utility Tools](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_078b20795c)[Available Data Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_f5cd07a203)[Instagram User Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_dbf5e39d0e)[Instagram Post Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_33bf71493a)[Instagram Comment Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_68109a8b70)[Instagram User Discovery Aggregate Fields](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_cba9b51855)[Key Features & Capabilities](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_6e7ad33c03)[Performance Optimization](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_d50c11af4b)[Pagination & Data Export](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_923d14b8f9)[Search & Query Features](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_51dace9cce)[Batch Operations](https://help.xpoz.ai/en/articles/12853061-which-tools-are-available#h_ae806effcb)

[Xpoz Help Center](https://help.xpoz.ai/en/)

Intercom [We run on Intercom](https://www.intercom.com/intercom-link?company=Xpoz&solution=customer-support&utm_campaign=intercom-link&utm_content=We+run+on+Intercom&utm_medium=help-center&utm_referrer=https%3A%2F%2Fhelp.xpoz.ai%2Fen%2Farticles%2F12853061-which-tools-are-available&utm_source=desktop-web)