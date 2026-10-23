<?php
/**
 * Removes the plugin's options and tables when the plugin is deleted. On a multisite
 * network, it removes them from every site.
 *
 * @package SocialIntegrations
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

// WordPress does not load the plugin before this file. These files only declare
// classes, so the code below can use their constants.
require_once __DIR__ . '/backend/Support/Sites.php';
require_once __DIR__ . '/backend/Support/Settings.php';
require_once __DIR__ . '/backend/Networks/Accounts.php';
require_once __DIR__ . '/backend/AI/Providers.php';
require_once __DIR__ . '/backend/Database/Migrations.php';
require_once __DIR__ . '/backend/Scheduler/AutoShare.php';
require_once __DIR__ . '/backend/Scheduler/Publisher.php';
require_once __DIR__ . '/backend/Plugin.php';

use SocialIntegrations\AI\Providers;
use SocialIntegrations\Database\Migrations;
use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Plugin;
use SocialIntegrations\Scheduler\AutoShare;
use SocialIntegrations\Scheduler\Publisher;
use SocialIntegrations\Support\Settings;
use SocialIntegrations\Support\Sites;

$sint_uninstall = static function () {
	global $wpdb;

	foreach ( array( Settings::OPTION, Accounts::OPTION, Accounts::APP_OPTION, Providers::KEYS_OPTION, Migrations::VERSION_OPTION ) as $option ) {
		delete_option( $option );
	}

	foreach ( array( Migrations::queue_table(), Migrations::logs_table(), Migrations::campaigns_table() ) as $table ) {
		$wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}

	foreach ( array( AutoShare::META_SHARED, AutoShare::META_DISABLED, AutoShare::META_CAPTION, AutoShare::META_ACCOUNTS ) as $meta_key ) {
		delete_post_meta_by_key( $meta_key );
	}

	foreach ( array( Publisher::CRON_HOOK, AutoShare::CRON_HOOK, Plugin::PRUNE_HOOK ) as $hook ) {
		wp_unschedule_hook( $hook );
	}
};

if ( is_multisite() ) {
	Sites::each( $sint_uninstall );
} else {
	$sint_uninstall();
}
