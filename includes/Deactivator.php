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
	 * Runs on plugin deactivation. A network deactivation stops the work on every site.
	 *
	 * @param bool $network_wide True when the plugin is deactivated for the whole network.
	 */
	public static function deactivate( $network_wide = false ): void {
		if ( ! is_multisite() || ! $network_wide ) {
			self::stop();
			return;
		}
		foreach ( get_sites(
			array(
				'fields' => 'ids',
				'number' => 0,
			)
		) as $site ) {
			switch_to_blog( $site );
			self::stop();
			restore_current_blog();
		}
	}

	/**
	 * Stops the scheduled work of the current site.
	 */
	private static function stop(): void {
		wp_clear_scheduled_hook( Publisher::CRON_HOOK );
		wp_clear_scheduled_hook( Plugin::PRUNE_HOOK );
		flush_rewrite_rules( false );
	}
}
