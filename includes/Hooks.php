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
}
