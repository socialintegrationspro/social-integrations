<?php
/**
 * WP-Cron helper.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Support;

defined( 'ABSPATH' ) || exit;

/**
 * Keeps a recurring WP-Cron event scheduled.
 */
final class Cron {

	/**
	 * On `init`, schedules a recurring event if it is not scheduled.
	 *
	 * @param string $hook       Cron hook.
	 * @param string $recurrence Schedule name, for example 'daily'.
	 * @param int    $delay      Seconds from now to the first run.
	 */
	public static function ensure( string $hook, string $recurrence, int $delay = 0 ): void {
		add_action(
			'init',
			static function () use ( $hook, $recurrence, $delay ) {
				if ( ! wp_next_scheduled( $hook ) ) {
					wp_schedule_event( time() + $delay, $recurrence, $hook );
				}
			}
		);
	}
}
