Loading

[×](https://business.reddithelp.com/s/article/Create-a-Reddit-Application# "Cancel and close") Sorry to interrupt

Uncaught ReferenceError: targetId is not defined
throws at https://business.reddithelp.com/s/article/modules/c/helpCenterArticle.js:1:10193

[Refresh](https://business.reddithelp.com/s/article/Create-a-Reddit-Application?nocache=https%3A%2F%2Fbusiness.reddithelp.com%2Fs%2Farticle%2FCreate-a-Reddit-Application)

![RedditAds](https://business.reddithelp.com/resource/1758144466000/redditLogoNew)

- Shopify Support
- Get Started
  - [Account Setup](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
  - [About Reddit Ads](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
  - [Billing & Payment](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
- Configure Signals
  - [Signal Measurement](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
  - [Share Conversions](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
  - [Third-Party Integrations](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
- Advertise
  - [Campaign Setup](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
  - [Campaign Objectives](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
  - [Ad Types & Creative](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
  - [Targeting](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
  - [Manage Ads](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
- Measure
  - [Validate Events](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
  - [Reporting](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
- Legal & Notices
  - [Policies](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
  - [Terms & Conditions](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
  - [Notices](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
- More
  - [Learn & Certify](https://adsformula.redditforbusiness.com/student/catalog?utm_source=ads_help_center)
  - [Sign Up](http://ads.reddit.com/register)

[Go to Home](https://business.reddithelp.com/s "Go to Home")

## Reddit

- Get Started



  - Account Setup

  - About Reddit Ads



    - Reddit Ads API



      - About the Reddit Ads API
      - Create a Reddit Application
      - Authenticate Your Developer Application

    - Share Conversions
    - Purchase a Reddit Ad
    - Promote Your Post
    - Brand Safety
    - Ad Review Process

  - Billing & Payment


- Configure Signals

- Advertise

- Measure

- Legal & Notices


[Get Started](https://business.reddithelp.com/s/article/Create-a-Reddit-Application#)[About Reddit Ads](https://business.reddithelp.com/s/article/Create-a-Reddit-Application#)[Reddit Ads API](https://business.reddithelp.com/s/article/Create-a-Reddit-Application#)[Create a Reddit Application](https://business.reddithelp.com/s/article/Create-a-Reddit-Application#)

# Create a Reddit Application

## Create a developer application to gain access to the Reddit API.

> **Important:** Only business admins can access this interface. Contact one of your business’s administrators for help.

Developer applications define the settings that determine how your app authenticates with the Ads API. These settings streamline workflows and enhance campaign management efficiency programmatically, enabling you to build custom tools to create and manage ad campaigns, generate reports, and manage custom audiences.

These settings can only be managed by business admins with a [verified account](https://support.reddithelp.com/hc/en-us/articles/360043047552-Why-should-I-verify-my-Reddit-account-with-an-email-address). You can manage your developer applications in _Business Manager > Developer Application_.

![](https://business.reddithelp.com/servlet/rtaImage?eid=ka0Kg00000002kV&feoid=00N5c00000HaSaT&refid=0EM5c000008oIdb)

![View larger](https://business.reddithelp.com/resource/1776278684000/HCExpandRight)

In this interface, you can:

- **Add an app:** Create or migrate an existing developer application to define the settings for how your app authenticates with the Ads API.
  - [**Create**](https://business.reddithelp.com/s/article/Create-a-Reddit-Application#create-an-application) **:** Make new developer application credentials for your app.

  - [**Migrate**](https://business.reddithelp.com/s/article/Create-a-Reddit-Application#migrate-an-application) **:** Move an existing developed app associated with your Reddit account to manage it in the Ads Manager.
- **Edit an app:** Change any setting for your application, excluding its app ID and secret.

- **Delete your app:** Remove this app from your business.


> **Important:** Deleting an app will disconnect all third-party services using it from the Ads API. This action can’t be undone.


## Create an application

1. In the developer application interface, select _Add Apps > Create an app_.

![](https://business.reddithelp.com/servlet/rtaImage?eid=ka0Kg00000002kV&feoid=00N5c00000HaSaT&refid=0EM5c000008oIdl)

![View larger](https://business.reddithelp.com/resource/1776278684000/HCExpandRight)

2. Set up your app.
   - **App name:** An appropriate and descriptive title. We recommend a name that reflects your business, product, or integration purpose. Avoid generic names like `Reddit Integration` or `Test`.

   - **Description (optional):** Information about your app.

   - **About URL:** The URL that provides more information about your business or application.

   - **Redirect URL:** The URL to authorize access to your application. We recommend setting a path on your business domain, like `https://mybusiness.com/oauth/callback`.

   - **Primary contact:** The business admin responsible for this app, who may be contacted for operational updates related to the Ads API. This must be set to a business admin. Here’s how to [set this permission](https://business.reddithelp.com/s/article/Add-users-to-a-Reddit-Ads-account#change-a-members-role).
3. When ready, select _Create App_. This will save your app and generate its secret and app ID.

![](https://business.reddithelp.com/servlet/rtaImage?eid=ka0Kg00000002kV&feoid=00N5c00000HaSaT&refid=0EM5c000008oIdq)

![View larger](https://business.reddithelp.com/resource/1776278684000/HCExpandRight)


## Migrate an application

> **Note:** Migration will limit your app’s scope to the Ads API. Follow our [Devvit guide](https://developers.reddit.com/docs/) for other scopes.

1. In the developer application interface, select _Add Apps > Migrate an existing app_.

![](https://business.reddithelp.com/servlet/rtaImage?eid=ka0Kg00000002kV&feoid=00N5c00000HaSaT&refid=0EM5c000008oIe0)

![View larger](https://business.reddithelp.com/resource/1776278684000/HCExpandRight)

2. Select the app to migrate.

3. Choose a primary contact for your app. This must be set to a business admin.

4. When ready, select _Migrate App_. This will make your app only available to manage in the developer application interface and remove it from [Preferences > Apps](https://www.reddit.com/prefs/apps/).

![](https://business.reddithelp.com/servlet/rtaImage?eid=ka0Kg00000002kV&feoid=00N5c00000HaSaT&refid=0EM5c000008oIe5)

![View larger](https://business.reddithelp.com/resource/1776278684000/HCExpandRight)


## Things to know

- A member cannot be removed from your business if they’re an active primary contact.

- You agree to the [Advertising Services Agreement](https://business.reddithelp.com/s/article/Reddit-Advertising-Services-Agreement), [Developer Terms](https://www.redditinc.com/policies/developer-terms), and [User Agreement](https://redditinc.com/policies/user-agreement) when creating or migrating an app.

- Migrating an application will limit your application’s scope to only the Ads API. Follow [our authentication guide](https://developers.reddit.com/docs/authentication) to set up access to Devvit.

- After creating your application, finish set up by [authenticating it](https://business.reddithelp.com/s/article/authenticate-your-developer-application).


## Learn more

**Account setup**

- [Authenticate your application](https://business.reddithelp.com/s/article/authenticate-your-developer-application)

- [Manage your business](https://business.reddithelp.com/s/article/business-manager) and [its members](https://business.reddithelp.com/s/article/Add-users-to-a-Reddit-Ads-account)

- [Set up your ads account](https://business.reddithelp.com/s/article/Create-and-manage-your-Reddit-Ads-account)


**Reddit Ads API**

- Learn about the [Reddit Ads API](https://business.reddithelp.com/s/article/Reddit-Ads-API)

- [Add adaptive time zone parameters](https://ads-api.reddit.com/docs/v3/#add-adaptive-time-zone-parameters)

- [Fetch ad accounts](https://ads-api.reddit.com/docs/v3/#fetch-ad-accounts)

- [Set up a campaign in the API](https://ads-api.reddit.com/docs/v3/#fetch-ad-accounts)

- [Manage customer lists in the API](https://ads-api.reddit.com/docs/v3/#manage-customer-lists)


PreviousAbout the Reddit Ads API

NextAuthenticate Your Developer Application

![Support Visual](https://cdn.prod.website-files.com/6661fe6bc11e42cfb125d619/67acf6b25d482922d79e5e86_3e60d095deecf75f1dd7.png)

## We're here to help you from set-up to success

Our Reddit Ads team is on-call and ready to help set up your campaign with confidence.

Book a call now to learn how Reddit ad formats, targeting, bidding, and measurement tools can deliver the outcomes you want.

[Speak with an Ads Expert](https://www.business.reddit.com/speak-with-a-reddit-ads-expert?utm_source=reddithelpcenter&utm_medium=referral&utm_campaign=bottomcta)

[About](https://www.redditinc.com/)[Reddit Ads Manager](https://ads.reddit.com/)[Reddit Help Center](https://support.reddithelp.com/hc?utm_source=ads&utm_medium=footer&utm_campaign=evergreen)![](https://business.reddithelp.com/resource/1658796963000/footerResources/LinkedInLogo.png)**[Follow Reddit for Business](https://www.linkedin.com/showcase/reddit-for-business/)**[Policies](https://www.redditinc.com/policies)[Reddit Ads Formula](https://adsformula.redditforbusiness.com/)[Blog](https://www.redditinc.com/blog)![](https://business.reddithelp.com/resource/1658796963000/footerResources/RedditSocial.png)**[Join r/RedditForBusiness](https://www.reddit.com/r/RedditforBusiness/)**

[About](https://www.redditinc.com/)[Reddit Ads Manager](https://ads.reddit.com/)[Reddit Help Center](https://support.reddithelp.com/hc?utm_source=ads&utm_medium=footer&utm_campaign=evergreen)[Policies](https://www.redditinc.com/policies)[Reddit Ads Formula](https://adsformula.redditforbusiness.com/)[Blog](https://www.redditinc.com/blog)![](https://business.reddithelp.com/resource/1658796963000/footerResources/LinkedInLogo.png)**[Follow Reddit for Business](https://www.linkedin.com/showcase/reddit-for-business/)**![](https://business.reddithelp.com/resource/1658796963000/footerResources/RedditSocial.png)**[Join r/RedditForBusiness](https://www.reddit.com/r/redditads/)**

- [User Agreement](https://www.redditinc.com/policies/user-agreement/)
- [Privacy Policy](https://www.reddit.com/policies/privacy-policy)
- [Content Policy](https://www.redditinc.com/policies/content-policy)
- [Moderator Code of Conduct](https://www.redditinc.com/policies/moderator-code-of-conduct)

© 2026 Reddit Inc.

[Your Privacy Choices Three](https://business.reddithelp.com/s/article/Create-a-Reddit-Application#)

Loading

Create a Reddit Application \| Reddit Ads Help

Need Help?![](https://business.reddithelp.com/resource/1713470035000/Thinking)