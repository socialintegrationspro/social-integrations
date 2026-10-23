=== Social Integrations – AI Auto Post & Social Media Scheduler ===
Contributors: socialintegrations
Tags: auto post, social media, scheduler, facebook, bluesky
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Share your posts, pages, products and any custom post type to social networks when you publish. Write captions with AI and plan them in a calendar.

== Description ==

Social Integrations shares your WordPress content to your social accounts.

* Auto-post campaigns share a post on first publish. Each campaign selects the post types, the accounts, a delay and the caption. Custom post types from other plugins and your theme are included.
* Networks: Facebook Page, LinkedIn profile, Bluesky, Threads and Telegram.
* Caption templates with {title}, {excerpt}, {url}, {tags}, {author}, {site} and {field:your_meta_key}.
* Block rules: select how each block type becomes caption text, an image, a link, or is not used. Editors can change it for one block from the block toolbar.
* A panel in the block editor: turn sharing on or off for a post, see the shares of the post, and (for administrators) select the accounts, write the caption with AI and see a preview.
* A week calendar and a list of every share.
* A share log that shows the result for each account, with Retry.
* AI captions with your own API key (OpenAI, Google Gemini or Anthropic Claude).

The uncompiled source of the admin app is in the `frontend/` folder of the public repository: https://github.com/SocialIntegrations/social-integrations

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
When you connect Bluesky and when a share runs, the plugin sends your handle, your app password (to sign in), the caption, the post link and the selected images to bsky.social. To show the account name and picture, it sends the account ID to public.api.bsky.app.
Terms: https://bsky.social/about/support/tos — Privacy: https://bsky.social/about/support/privacy-policy

= Link previews and images =
For a Bluesky link card, the plugin gets the page of the shared link to read its title, description and image. When a post holds an image from another site, the plugin gets that image to send it to the network. These requests go to the site of the link or the image. They do not send your data.

= Telegram Bot API =
When you connect Telegram and when a share runs, the plugin sends the caption, the post link and the selected images to api.telegram.org.
Terms: https://telegram.org/tos — Privacy: https://telegram.org/privacy

= AI providers =
Only when you enter your own API key and select "Write with AI", the plugin sends the post title, excerpt and text to the provider you selected: OpenAI (api.openai.com, terms https://openai.com/policies/terms-of-use, privacy https://openai.com/policies/privacy-policy), Google Gemini (generativelanguage.googleapis.com, terms https://ai.google.dev/gemini-api/terms, privacy https://policies.google.com/privacy) or Anthropic (api.anthropic.com, terms https://www.anthropic.com/legal/consumer-terms, privacy https://www.anthropic.com/legal/privacy).

== Credits ==

The admin screens use the Plus Jakarta Sans font, included in the plugin (SIL Open Font License 1.1). The plugin does not load fonts from other sites.

== Installation ==

1. Install and activate the plugin.
2. Open Social Integrations in the admin menu.
3. Connect an account on the Accounts screen.
4. On the Campaigns screen, select "New campaign" and make an auto-post campaign.

== Changelog ==

= 0.1.0 =
* First version.
