<?php
/**
 * Removes the plugin's options and tables when the plugin is deleted. On a multisite
 * network, it removes them from every site.
 *
 * @package SocialIntegrations
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

require_once __DIR__ . '/backend/Support/Sites.php';

$sint_uninstall = static function () {
	global $wpdb;

	foreach ( array( 'sint_settings', 'sint_accounts', 'sint_network_apps', 'sint_ai_keys', 'sint_db_version' ) as $option ) {
		delete_option( $option );
	}

	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}sint_queue" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}sint_logs" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}sint_campaigns" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared

	delete_post_meta_by_key( '_sint_auto_shared' );
	delete_post_meta_by_key( '_sint_disabled' );
	delete_post_meta_by_key( '_sint_caption' );
	delete_post_meta_by_key( '_sint_accounts' );

	wp_unschedule_hook( 'sint_run_queue' );
	wp_unschedule_hook( 'sint_auto_share_post' );
	wp_unschedule_hook( 'sint_prune_logs' );
};

if ( is_multisite() ) {
	\SocialIntegrations\Support\Sites::each( $sint_uninstall );
} else {
	$sint_uninstall();
}
