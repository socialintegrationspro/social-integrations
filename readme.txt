=== Social Integrations – Auto Post & Social Media Scheduler ===
Contributors: socialintegrations
Tags: auto post, social media, scheduler, facebook, linkedin
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Share posts, pages, products and any custom post type to social networks when you publish. Write captions with tokens and plan them in a calendar.

== Description ==

Social Integrations shares your WordPress content to your social accounts.

* Auto-post campaigns share a post on first publish. Each campaign selects the post types, the accounts, a delay and the caption. Campaigns also support custom post types from other plugins and your theme.
* Networks: one Facebook Page and one LinkedIn profile.
* Caption templates with {title}, {excerpt}, {url}, {tags}, {author}, {site} and {field:your_meta_key}.
* Post options for each network: the post format (media, link card or text), a first comment, the link card title and description, and options such as who can see or reply to the post. The options use the same tags as the caption.
* Block rules: select how the plugin uses each block type: as caption text, an image, a link, or not at all. Editors can change the rule for one block in the block toolbar.
* A panel in the block editor: turn auto-post on or off for a post, see the shares of the post, and (for administrators) select the accounts, write the caption and see a preview.
* A week calendar and a list of every share.
* A share log that shows the result for each account, with Retry.

The uncompiled source of the admin app is in the `frontend/` folder of the public repository: https://github.com/socialintegrationspro/social-integrations

== External services ==

This plugin sends data to a third-party service only when you connect an account or share content to it.

= Social Integrations app (auth-apps.socialintegrations.com) =
To connect Facebook or LinkedIn without your own developer app, select "Connect with Social Integrations". The plugin then registers your site with auth-apps.socialintegrations.com. It sends the site address, the sign-in return address, a verification address and a one-time verification code. For each sign-in, it sends the network name and a random state value. The network sends you back through the server. The server exchanges the sign-in code and gives the access token to your site one time. The server does not keep the token. When the token expires, the plugin sends the token and the renewal token to the server to renew it. The plugin does not contact the server before you select "Connect with Social Integrations". If you use your own app for each network, the plugin sends nothing to this server.
Terms: https://socialintegrations.com/terms — Privacy: https://socialintegrations.com/privacy

= Facebook (Meta Graph API) =
When you connect a Facebook Page and when a share runs, the plugin sends the caption, the post link, the selected images and the first comment (when you set one) to graph.facebook.com.
Terms: https://www.facebook.com/terms.php — Privacy: https://www.facebook.com/privacy/policy/

= LinkedIn =
When you connect LinkedIn and when a share runs, the plugin sends the caption, the post link, the selected images, the link card title and description, the visibility setting and the first comment (when you set one) to api.linkedin.com.
Terms: https://www.linkedin.com/legal/user-agreement — Privacy: https://www.linkedin.com/legal/privacy-policy

= Images from other sites =
When a post holds an image from another site, the plugin gets that image to send it to the network. These requests go to the site of the link or the image. They do not send your data.

== Credits ==

The admin screens use the Plus Jakarta Sans font, included in the plugin (SIL Open Font License 1.1). The plugin does not load fonts from other sites.

== Installation ==

1. Install and activate the plugin.
2. Open Social Integrations in the admin menu.
3. Connect an account on the Accounts screen.
4. On the Campaigns screen, select "New campaign". Then create an auto-post campaign.

== Frequently Asked Questions ==

= Which networks can I connect? =

You can connect one Facebook Page and one LinkedIn profile.

= Do I need my own Facebook or LinkedIn developer app? =

No. Select "Connect with Social Integrations" to connect without your own app. You can also enter the app ID and secret of your own app on the Accounts screen.

= Does the plugin share a post again when I update it? =

No. An auto-post campaign shares a post one time, when you publish it for the first time.

= Can I share pages, WooCommerce products and custom post types? =

Yes. An auto-post campaign can share every public post type.

= Where can I see if a share failed? =

Open the share log. It shows the result for each account. Select Retry to send a failed share again.

== Screenshots ==

1. The dashboard shows the shares by status and the next scheduled shares.
2. The composer: write a caption with tokens, and see a preview for each network.
3. The Accounts screen: connect Facebook and LinkedIn.
4. The week calendar shows the scheduled shares.
5. The share log shows the result for each account.
6. The panel in the block editor.

== Changelog ==

= 0.1.0 =
* First version.
