=== Social Integrations – AI Auto Post & Social Media Scheduler ===
Contributors: socialintegrations
Tags: auto post, social media, scheduler, facebook, bluesky
Requires at least: 6.3
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Share your posts, pages, products and any custom post type to social networks when you publish. Write captions with AI and plan them in a calendar.

== Description ==

Social Integrations shares your WordPress content to your social accounts.

* Auto-share on first publish, for each post type you select. This includes custom post types from other plugins and your theme.
* Networks: Facebook Page, LinkedIn profile, Bluesky, Threads and Telegram.
* Caption templates with {title}, {excerpt}, {url}, {tags}, {author}, {site} and {field:your_meta_key}.
* Block rules: select how each block becomes caption text, an image, a link, or is not used. Editors can change it for one block from the block toolbar.
* A week calendar and a list of every share, with a share log and Retry.
* AI captions with your own API key (OpenAI, Google Gemini or Anthropic Claude).

The uncompiled source of the admin app is in the `src/` folder of the public repository: https://github.com/SocialIntegrations/social-integrations

== External services ==

This plugin sends data to a third-party service only when you connect an account or share content to it.

= Facebook (Meta Graph API) =
When you connect a Facebook Page and when a share runs, the plugin sends the caption, the post link and the selected images to graph.facebook.com.
Terms: https://www.facebook.com/terms.php — Privacy: https://www.facebook.com/privacy/policy/

= Threads (Meta Threads API) =
When you connect Threads and when a share runs, the plugin sends the caption, the post link and the selected images to graph.threads.net.
Terms: https://help.instagram.com/769983657850450 — Privacy: https://privacycenter.instagram.com/policy

= LinkedIn =
When you connect LinkedIn and when a share runs, the plugin sends the caption, the post link and the selected images to api.linkedin.com.
Terms: https://www.linkedin.com/legal/user-agreement — Privacy: https://www.linkedin.com/legal/privacy-policy

= Bluesky =
When you connect Bluesky and when a share runs, the plugin sends your handle, your app password (to sign in), the caption, the post link and the selected images to bsky.social.
Terms: https://bsky.social/about/support/tos — Privacy: https://bsky.social/about/support/privacy-policy

= Telegram Bot API =
When you connect Telegram and when a share runs, the plugin sends the caption, the post link and the selected images to api.telegram.org.
Terms: https://telegram.org/tos — Privacy: https://telegram.org/privacy

= AI providers =
Only when you enter your own API key and select "Write with AI", the plugin sends the post title, excerpt and text to the provider you selected: OpenAI (api.openai.com, terms https://openai.com/policies/terms-of-use, privacy https://openai.com/policies/privacy-policy), Google Gemini (generativelanguage.googleapis.com, terms https://ai.google.dev/gemini-api/terms, privacy https://policies.google.com/privacy) or Anthropic (api.anthropic.com, terms https://www.anthropic.com/legal/consumer-terms, privacy https://www.anthropic.com/legal/privacy).

== Installation ==

1. Install and activate the plugin.
2. Open Social Integrations in the admin menu.
3. Connect an account on the Accounts screen.
4. On the Settings screen, select the post types to share on publish.

== Changelog ==

= 0.1.0 =
* First version.
