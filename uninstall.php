<?php
/**
 * Removes the plugin's options and tables when the plugin is deleted.
 *
 * @package SocialIntegrations
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;

foreach ( array( 'sint_settings', 'sint_accounts', 'sint_network_apps', 'sint_db_version' ) as $sint_option ) {
	delete_option( $sint_option );
}

$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}sint_queue" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}sint_logs" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}sint_campaigns" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared

delete_post_meta_by_key( '_sint_auto_shared' );
delete_post_meta_by_key( '_sint_disabled' );
delete_post_meta_by_key( '_sint_caption' );
delete_post_meta_by_key( '_sint_accounts' );

wp_clear_scheduled_hook( 'sint_run_queue' );
wp_clear_scheduled_hook( 'sint_prune_logs' );
