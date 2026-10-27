<?php
/**
 * Public extension points.
 *
 * Every filter and action other plugins can use is named here, so the list of
 * supported hooks lives in one place.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations;

defined( 'ABSPATH' ) || exit;

/**
 * Hook names.
 */
final class Hooks {

	/**
	 * Action. Fires at the end of `plugins_loaded` (priority 10) after the plugin boots.
	 * Receives the Plugin instance.
	 */
	const LOADED = 'sint/loaded';

	/**
	 * Filter. Network class names the Registry builds. Each must extend AbstractNetwork.
	 *
	 * @param string[] $classes
	 */
	const NETWORK_CLASSES = 'sint/network_classes';

	/**
	 * Filter. Post types offered in the Content screen and Settings.
	 *
	 * @param array<string, array> $post_types Keyed by post type name.
	 */
	const POST_TYPES = 'sint/post_types';

	/**
	 * Filter. How one block becomes part of a social post.
	 *
	 * @param array  $part  ['text' => string, 'media' => array, 'links' => array].
	 * @param array  $block Parsed block.
	 * @param string $use   The rule that applied.
	 */
	const BLOCK_PART = 'sint/block_part';

	/**
	 * Filter. Values for caption template tokens such as {title} or {event_date}.
	 *
	 * @param array<string, string> $tokens
	 * @param \WP_Post              $post
	 */
	const TEMPLATE_TOKENS = 'sint/template_tokens';

	/**
	 * Filter. The custom fields the app offers for a post type, for {field:key} and media.
	 *
	 * @param array  $fields Each: key, label, media (bool: the field holds images), sample.
	 * @param string $type   Post type name.
	 */
	const CUSTOM_FIELDS = 'sint/custom_fields';

	/**
	 * Filter. Data handed to the admin app as `window.sintConfig`.
	 *
	 * @param array $config
	 */
	const ADMIN_CONFIG = 'sint/admin_config';

	/**
	 * Filter. Script handles the admin app loads after. A handle added here loads
	 * first, so its `wp.hooks` filters are in place before the app renders.
	 *
	 * @param string[] $handles
	 */
	const ADMIN_SCRIPT_DEPENDENCIES = 'sint/admin_script_dependencies';

	/**
	 * Filter. Script handles the block editor panel loads after. A handle added here loads
	 * first, so its `wp.hooks` filters are in place before the panel renders.
	 *
	 * @param string[] $handles
	 */
	const EDITOR_SCRIPT_DEPENDENCIES = 'sint/editor_script_dependencies';

	/**
	 * Filter. The connected accounts the plugin can share to.
	 *
	 * @param array[] $accounts
	 */
	const ACCOUNTS = 'sint/accounts';

	/**
	 * Filter. The IDs of the accounts that a user can use in the admin app and the editor.
	 * Null: every account. The plugin then shows the user only these accounts, and the shares
	 * and campaigns on them. It refuses a change that uses another account. Shares that the
	 * plugin sends on WP-Cron or on publish use every account.
	 *
	 * @param string[]|null $account_ids
	 * @param int           $user_id
	 */
	const USER_ACCOUNTS = 'sint/user_accounts';

	/**
	 * Action. Fires after a share to one account finishes.
	 *
	 * @param array $result ['status' => 'published'|'failed', ...].
	 * @param array $job    The queue row.
	 */
	const SHARE_COMPLETED = 'sint/share_completed';

	/**
	 * Filter. Whether an auto-post campaign shares a post. Runs before the plugin queues the
	 * post's shares, a few seconds after the post is published, so its terms and meta are
	 * saved. The plugin asks only active campaigns that include the post's type.
	 *
	 * @param bool     $match    True.
	 * @param \WP_Post $post
	 * @param array    $campaign The campaign, with its `id`.
	 */
	const AUTO_CAMPAIGN_MATCHES = 'sint/auto_campaign_matches';

	/**
	 * Filter. The storage behind connected accounts. Return an
	 * \SocialIntegrations\Networks\AccountStore to replace the default, which keeps
	 * one account for each network.
	 *
	 * @param \SocialIntegrations\Networks\AccountStore|null $store
	 */
	const ACCOUNT_STORE = 'sint/account_store';

	/**
	 * Filter. The share that an auto-post campaign adds for one account, before the plugin
	 * queues it. A filter can change the caption, the media, the link or the fields.
	 *
	 * @param array    $share    ['caption' => string, 'media' => array, 'link' => string,
	 *                           'fields' => [ network => [ field name => value ] ]].
	 * @param \WP_Post $post
	 * @param array    $account  The account the share goes to.
	 * @param array    $campaign The campaign, with its `id` and `captions`.
	 */
	const AUTO_SHARE = 'sint/auto_share';

	/**
	 * Filter. The result of a share to one account, before the plugin writes it to the share
	 * log and fires sint/share_completed.
	 *
	 * @param array $result ['status' => 'published'|'failed', 'message' => string, 'details' => array, ...].
	 * @param array $job    The queue row.
	 */
	const SHARE_RESULT = 'sint/share_result';

	/**
	 * Filter. The template that the plugin builds a share from. It starts as the post type's
	 * template; a filter can return another one for an account or a context.
	 *
	 * @param array    $template ['caption' => string, 'captions' => array<network, string>,
	 *                           'media' => 'auto'|'featured'|'content'|'custom'|'none',
	 *                           'custom_media' => array of attachment IDs or media items,
	 *                           'link' => link template, such as '{url}',
	 *                           'fields' => [ '*' | network => [ field name => template ] ] (see Content\PostFields)].
	 * @param \WP_Post $post
	 * @param array    $account  The account the share goes to; empty when not known yet.
	 * @param string   $context  'auto' on publish, 'composer' in the admin app, or a caller's own name.
	 */
	const SHARE_TEMPLATE = 'sint/share_template';

	/**
	 * Action. Fires when the plugin adds shares, before it sends any: from the admin app, or
	 * on publish.
	 *
	 * @param int[] $ids     Queue row IDs, one per account.
	 * @param array $options From the admin app: the unsanitized `options` the composer sent
	 *                       (see the `sint.composer.options` JS filter). On publish:
	 *                       [ 'source' => 'auto', 'campaign' => int ], once per campaign.
	 */
	const SHARES_CREATED = 'sint/shares_created';

	/**
	 * Action. Fires after a user saves a campaign in the admin app.
	 *
	 * @param int    $id      Campaign ID.
	 * @param string $type    Campaign type, for example 'single' or 'auto'.
	 * @param bool   $live    False when the campaign is a draft or off, so it sends nothing yet.
	 * @param bool   $created True for a new campaign, false for a change to a campaign.
	 */
	const CAMPAIGN_SAVED = 'sint/campaign_saved';

	/**
	 * Action. Fires after a user deletes a campaign in the admin app. A plugin that adds its
	 * own campaign type fires it too.
	 *
	 * @param int    $id       Campaign ID.
	 * @param string $type     Campaign type.
	 * @param array  $campaign The campaign as it was, with its `name`.
	 */
	const CAMPAIGN_DELETED = 'sint/campaign_deleted';

	/**
	 * Action. Fires after a user turns a campaign on or off in the admin app. A plugin that
	 * adds its own campaign type fires it too.
	 *
	 * @param int    $id     Campaign ID.
	 * @param string $type   Campaign type.
	 * @param bool   $active True: the user turned the campaign on.
	 */
	const CAMPAIGN_ACTIVE = 'sint/campaign_active';

	/**
	 * Filter. Campaigns listed on the Campaigns screen. Add items of your own `type`; the
	 * admin app's `sint.campaigns.actions` JS filter handles their buttons. Give each item
	 * the `created_by` user ID, and the plugin adds the user's name as `author`.
	 *
	 * @param array[] $items Each: [ 'id', 'type', 'name', 'accounts', 'status', 'next_at',
	 *                       'last_at', 'sent', 'total', 'updated_at', 'created_by', 'actions' ].
	 */
	const CAMPAIGNS = 'sint/campaigns';

	/**
	 * Filter. The next shares on the Dashboard. Add shares that are planned but not in the
	 * queue yet. The plugin sorts the list by time and shows the first ones.
	 *
	 * @param array[] $shares Each: [ 'id' => int|string, 'network', 'account_id', 'title',
	 *                        'scheduled_at' => ISO 8601 time ].
	 */
	const UPCOMING_SHARES = 'sint/upcoming_shares';

	/**
	 * Filter. Finishes an OAuth sign-in that a plugin started with
	 * \SocialIntegrations\Auth\ConnectSession::begin() and a context type other than 'admin'.
	 * Check the context, finish the sign-in (ConnectSession::exchange(), then Accounts::save()),
	 * and return true. The plugin then stops the request. When no filter returns true, the
	 * plugin shows "This sign-in link is not valid."
	 *
	 * @param bool   $handled False.
	 * @param array  $session ['network', 'method', 'context', 'verifier'], already used.
	 * @param string $code    Code from the network; empty when the sign-in failed.
	 * @param string $error   Error from the network; empty when there is none.
	 */
	const OAUTH_CALLBACK = 'sint/oauth_callback';

	/**
	 * Action. Fires after a user disconnects an account, when the plugin has cancelled its
	 * scheduled shares and removed it from the campaigns. Remove the account ID from your own
	 * data. A list that becomes empty must not mean "every account".
	 *
	 * @param string $account_id Account ID.
	 * @param array  $account    The account as it was, without credentials.
	 */
	const ACCOUNT_DELETED = 'sint/account_deleted';

	/**
	 * Action. Fires after the plugin saves a connected account: a new account, or a sign-in
	 * again to an account that it has already.
	 *
	 * @param string $account_id  Account ID.
	 * @param array  $account     The account, without credentials.
	 * @param bool   $reconnected True when the account was there before.
	 */
	const ACCOUNT_CONNECTED = 'sint/account_connected';

	/**
	 * Action. Fires after a user sends a failed share again.
	 *
	 * @param array $job    The queue row.
	 * @param array $result ['status' => 'published'|'failed', ...].
	 */
	const SHARE_RETRIED = 'sint/share_retried';

	/**
	 * Action. Fires after a user deletes a share from the queue.
	 *
	 * @param array $job The queue row as it was.
	 */
	const SHARE_DELETED = 'sint/share_deleted';

	/**
	 * Action. Fires after a user deletes entries from the share log.
	 *
	 * @param string[] $keys    The keys of the entries.
	 * @param int      $deleted The number of log rows that the plugin deleted.
	 */
	const LOGS_DELETED = 'sint/logs_deleted';

	/**
	 * Action. Fires after the plugin renews the credentials of an account before a share.
	 *
	 * @param string $account_id Account ID.
	 * @param array  $old        Credentials before the renewal.
	 * @param array  $fresh      Credentials after the renewal, as saved.
	 * @param string $network    Network key.
	 */
	const CREDENTIALS_RENEWED = 'sint/credentials_renewed';
}
