<?php
/**
 * Date helpers.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Support;

defined( 'ABSPATH' ) || exit;

/**
 * The plugin stores dates in UTC and sends them to the browser as ISO 8601 with an offset.
 */
final class Dates {

	/**
	 * UTC MySQL date to ISO 8601.
	 *
	 * @param string $mysql_utc 'Y-m-d H:i:s' in UTC.
	 */
	public static function iso( string $mysql_utc ): string {
		$time = strtotime( $mysql_utc . ' UTC' );
		return $time ? gmdate( 'c', $time ) : '';
	}
}
