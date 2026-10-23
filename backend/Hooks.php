<?php
/**
 * Public extension points.
 *
 * Every filter and action other plugins may use is named here, so the list of
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
	 * Action. Fires at the end of `plugins_loaded` (priority 10) when the plugin has booted.
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
	 * Filter. The connected accounts the plugin can share to.
	 *
	 * @param array[] $accounts
	 */
	const ACCOUNTS = 'sint/accounts';

	/**
	 * Action. Fires after a share to one account finishes.
	 *
	 * @param array $result ['status' => 'published'|'failed', ...].
	 * @param array $job    The queue row.
	 */
	const SHARE_COMPLETED = 'sint/share_completed';

	/**
	 * Filter. Whether an auto-post campaign shares a post. Runs when the post's shares are
	 * about to be queued, a few seconds after it is published, so its terms and meta are
	 * saved. Only campaigns that are on and include the post's type are asked.
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
	 * Filter. AI providers offered in Settings. Each must implement
	 * \SocialIntegrations\AI\ProviderInterface.
	 *
	 * @param \SocialIntegrations\AI\ProviderInterface[] $providers
	 */
	const AI_PROVIDERS = 'sint/ai_providers';

	/**
	 * Filter. The template a share is built from. Starts as the post type's template;
	 * a filter can return another one for an account or a context.
	 *
	 * @param array    $template ['caption' => string, 'captions' => array<network, string>,
	 *                           'media' => 'auto'|'featured'|'content'|'custom'|'none',
	 *                           'custom_media' => array of attachment IDs or media items].
	 * @param \WP_Post $post
	 * @param array    $account  The account the share goes to; empty when not known yet.
	 * @param string   $context  'auto' on publish, 'composer' in the admin app, or a caller's own name.
	 */
	const SHARE_TEMPLATE = 'sint/share_template';

	/**
	 * Action. Fires when shares are added, before any is sent: from the admin app, or on
	 * publish.
	 *
	 * @param int[] $ids     Queue row IDs, one per account.
	 * @param array $options From the admin app: the unsanitized `options` the composer sent
	 *                       (see the `sint.composer.options` JS filter). On publish:
	 *                       [ 'source' => 'auto', 'campaign' => int ], once per campaign.
	 */
	const SHARES_CREATED = 'sint/shares_created';

	/**
	 * Filter. Campaigns listed on the Campaigns screen. Add items of your own `type`; the
	 * admin app's `sint.campaigns.actions` JS filter handles their buttons.
	 *
	 * @param array[] $items Each: [ 'id', 'type', 'name', 'accounts', 'status', 'next_at',
	 *                       'last_at', 'sent', 'total', 'updated_at', 'actions' ].
	 */
	const CAMPAIGNS = 'sint/campaigns';
}
