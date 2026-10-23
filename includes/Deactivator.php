<?php
/**
 * Deactivation.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations;

use SocialIntegrations\Scheduler\Publisher;

defined( 'ABSPATH' ) || exit;

/**
 * Stops scheduled work. Data stays until the plugin is deleted.
 */
final class Deactivator {

	/**
	 * Runs on plugin deactivation.
	 */
	public static function deactivate(): void {
		wp_clear_scheduled_hook( Publisher::CRON_HOOK );
		wp_clear_scheduled_hook( Plugin::PRUNE_HOOK );
		flush_rewrite_rules( false );
	}
}
