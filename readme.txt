=== Social Integrations – AI Auto Post & Social Media Scheduler ===
Contributors: socialintegrations
Tags: auto post, social media, scheduler, facebook, linkedin
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Share your posts, pages, products and any custom post type to social networks when you publish. Write captions with AI and plan them in a calendar.

== Description ==

Social Integrations shares your WordPress content to your social accounts.

* Auto-post campaigns share a post on first publish. Each campaign selects the post types, the accounts, a delay and the caption. Campaigns also support custom post types from other plugins and your theme.
* Networks: one Facebook Page and one LinkedIn profile.
* Caption templates with {title}, {excerpt}, {url}, {tags}, {author}, {site} and {field:your_meta_key}.
* Post options for each network: the post format (media, link card or text), a first comment, the link card title and description, and options such as who can see or reply to the post. The options use the same tags as the caption.
* Block rules: select how the plugin uses each block type: as caption text, an image, a link, or not at all. Editors can change the rule for one block in the block toolbar.
* A panel in the block editor: turn auto-post on or off for a post, see the shares of the post, and (for administrators) select the accounts, write the caption with AI and see a preview.
* A week calendar and a list of every share.
* A share log that shows the result for each account, with Retry.
* AI captions with your own API key (OpenAI, Google Gemini or Anthropic Claude).

The uncompiled source of the admin app is in the `frontend/` folder of the public repository: https://github.com/SocialIntegrations/social-integrations

== External services ==

This plugin sends data to a third-party service only when you connect an account or share content to it.

= Social Integrations app (app.socialintegrations.com) =
To connect Facebook or LinkedIn without your own developer app, select "Connect with Social Integrations". The plugin then registers your site with app.socialintegrations.com and sends the site address and the network name. The network sends you back through that server. The server exchanges the sign-in code and gives the access token to your site once. The server does not keep the token. When the token expires, the plugin sends it to the server to renew it. To show the "Connect with Social Integrations" choice, the Accounts screen gets the list of supported networks from the server. This request sends no data about you or your site. If you use your own app for each network, the plugin sends nothing else to this server.
Terms: https://socialintegrations.com/terms — Privacy: https://socialintegrations.com/privacy

= Facebook (Meta Graph API) =
When you connect a Facebook Page and when a share runs, the plugin sends the caption, the post link, the selected images and the first comment (when you set one) to graph.facebook.com.
Terms: https://www.facebook.com/terms.php — Privacy: https://www.facebook.com/privacy/policy/

= LinkedIn =
When you connect LinkedIn and when a share runs, the plugin sends the caption, the post link, the selected images, the link card title and description, the visibility setting and the first comment (when you set one) to api.linkedin.com.
Terms: https://www.linkedin.com/legal/user-agreement — Privacy: https://www.linkedin.com/legal/privacy-policy

= Images from other sites =
When a post holds an image from another site, the plugin gets that image to send it to the network. These requests go to the site of the link or the image. They do not send your data.

= AI providers =
Only when you enter your own API key, the plugin sends data to the provider that you selected. When you use the AI menu next to a caption, it sends the caption, and the post title, excerpt and text when you write from a post. When an auto-post campaign uses "Write with AI", it sends the instructions of the campaign with the values of the post (such as the title, the excerpt, the text, the price and custom fields) one time for each new post. The providers are OpenAI (api.openai.com, terms https://openai.com/policies/terms-of-use, privacy https://openai.com/policies/privacy-policy), Google Gemini (generativelanguage.googleapis.com, terms https://ai.google.dev/gemini-api/terms, privacy https://policies.google.com/privacy) or Anthropic (api.anthropic.com, terms https://www.anthropic.com/legal/consumer-terms, privacy https://www.anthropic.com/legal/privacy).

== Credits ==

The admin screens use the Plus Jakarta Sans font, included in the plugin (SIL Open Font License 1.1). The plugin does not load fonts from other sites.

== Installation ==

1. Install and activate the plugin.
2. Open Social Integrations in the admin menu.
3. Connect an account on the Accounts screen.
4. On the Campaigns screen, select "New campaign". Then create an auto-post campaign.

== Changelog ==

= 0.1.0 =
* First version.
