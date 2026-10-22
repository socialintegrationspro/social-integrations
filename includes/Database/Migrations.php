<?php
/**
 * Database tables.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Database;

defined( 'ABSPATH' ) || exit;

/**
 * Creates and upgrades the plugin's tables.
 */
final class Migrations {

	const VERSION_OPTION = 'sint_db_version';

	/**
	 * The queue table name.
	 */
	public static function queue_table(): string {
		global $wpdb;
		return $wpdb->prefix . 'sint_queue';
	}

	/**
	 * The share log table name.
	 */
	public static function logs_table(): string {
		global $wpdb;
		return $wpdb->prefix . 'sint_logs';
	}

	/**
	 * Runs the migrations when the stored version is older than the code.
	 */
	public static function maybe_upgrade(): void {
		if ( get_option( self::VERSION_OPTION ) !== SINT_DB_VERSION ) {
			self::run();
		}
	}

	/**
	 * Creates or updates the tables with dbDelta.
	 */
	public static function run(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset = $wpdb->get_charset_collate();
		$queue   = self::queue_table();
		$logs    = self::logs_table();

		dbDelta(
			"CREATE TABLE {$queue} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				post_id bigint(20) unsigned NOT NULL DEFAULT 0,
				network varchar(50) NOT NULL,
				account_id varchar(100) NOT NULL,
				caption longtext NOT NULL,
				media longtext NULL,
				link varchar(2048) NOT NULL DEFAULT '',
				status varchar(20) NOT NULL DEFAULT 'scheduled',
				scheduled_at datetime NOT NULL,
				attempts smallint(5) unsigned NOT NULL DEFAULT 0,
				created_by bigint(20) unsigned NOT NULL DEFAULT 0,
				created_at datetime NOT NULL,
				updated_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY status_scheduled (status, scheduled_at),
				KEY post_id (post_id)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$logs} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				queue_id bigint(20) unsigned NOT NULL DEFAULT 0,
				post_id bigint(20) unsigned NOT NULL DEFAULT 0,
				network varchar(50) NOT NULL,
				account_id varchar(100) NOT NULL,
				status varchar(20) NOT NULL,
				message text NULL,
				remote_id varchar(191) NOT NULL DEFAULT '',
				remote_url varchar(2048) NOT NULL DEFAULT '',
				created_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY post_id (post_id),
				KEY queue_id (queue_id)
			) {$charset};"
		);

		update_option( self::VERSION_OPTION, SINT_DB_VERSION, false );
	}
}
