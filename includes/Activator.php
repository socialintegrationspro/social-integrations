<?php
/**
 * Activation.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations;

use SocialIntegrations\Database\Migrations;

defined( 'ABSPATH' ) || exit;

/**
 * Creates the tables and default settings.
 */
final class Activator {

	/**
	 * Runs on plugin activation.
	 */
	public static function activate(): void {
		Migrations::run();

		if ( false === get_option( Support\Settings::OPTION ) ) {
			add_option( Support\Settings::OPTION, Support\Settings::defaults(), '', false );
		}
	}
}
