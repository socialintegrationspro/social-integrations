<?php
/**
 * The plugin's capabilities.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Support;

defined( 'ABSPATH' ) || exit;

/**
 * Names the capabilities that the plugin checks, and maps each one to a WordPress capability.
 *
 * Every check in the plugin uses one of these names, not a WordPress capability. The plugin
 * maps them to `manage_options` through the `map_meta_cap` filter. Other plugins can change
 * the map with a later `map_meta_cap` filter.
 */
final class Capabilities {

	/**
	 * Open the admin app and read its data.
	 */
	const VIEW = 'sint_view';

	/**
	 * Make, change and delete campaigns and shares, and write captions. Without PUBLISH,
	 * the user saves only drafts and campaigns that are off.
	 */
	const SHARE = 'sint_share';

	/**
	 * Send and schedule shares, send a failed share again, and turn campaigns on.
	 */
	const PUBLISH = 'sint_publish';

	/**
	 * Connect and disconnect accounts, and save app credentials.
	 */
	const MANAGE_ACCOUNTS = 'sint_manage_accounts';

	/**
	 * Change the settings and delete the share log.
	 */
	const MANAGE_SETTINGS = 'sint_manage_settings';

	/**
	 * All the capabilities.
	 */
	const ALL = array( self::VIEW, self::SHARE, self::PUBLISH, self::MANAGE_ACCOUNTS, self::MANAGE_SETTINGS );

	/**
	 * Registers hooks.
	 */
	public static function register(): void {
		add_filter( 'map_meta_cap', array( self::class, 'map' ), 10, 2 );
	}

	/**
	 * Gives each capability to the users who can manage the site options.
	 *
	 * @param string[] $caps The WordPress capabilities that the user needs.
	 * @param string   $cap  The capability that the code checks.
	 * @return string[]
	 */
	public static function map( array $caps, string $cap ): array {
		return in_array( $cap, self::ALL, true ) ? array( 'manage_options' ) : $caps;
	}
}
