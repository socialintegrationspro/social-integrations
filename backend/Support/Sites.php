<?php
/**
 * Multisite helper.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Support;

defined( 'ABSPATH' ) || exit;

/**
 * Runs work on each site of a multisite network.
 */
final class Sites {

	/**
	 * Runs a callback once on each site of the network, with that site as the current site.
	 *
	 * @param callable $callback Callback without arguments.
	 */
	public static function each( callable $callback ): void {
		foreach ( get_sites(
			array(
				'fields' => 'ids',
				'number' => 0,
			)
		) as $site ) {
			switch_to_blog( $site );
			$callback();
			restore_current_blog();
		}
	}
}
