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
	 * Campaigns table name.
	 */
	public static function campaigns_table(): string {
		global $wpdb;
		return $wpdb->prefix . 'sint_campaigns';
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
		self::create_queue_table( $charset );
		self::create_logs_table( $charset );
		self::create_campaigns_table( $charset );
		self::upgrade_data();

		update_option( self::VERSION_OPTION, SINT_DB_VERSION, false );
	}

	/**
	 * Creates or updates the queue table.
	 *
	 * @param string $charset Charset and collation.
	 */
	private static function create_queue_table( string $charset ): void {
		$queue = self::queue_table();
		dbDelta(
			"CREATE TABLE {$queue} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				post_id bigint(20) unsigned NOT NULL DEFAULT 0,
				campaign_id bigint(20) unsigned NOT NULL DEFAULT 0,
				campaign_key varchar(64) NOT NULL DEFAULT '',
				batch_id varchar(32) NOT NULL DEFAULT '',
				network varchar(50) NOT NULL,
				account_id varchar(100) NOT NULL,
				caption longtext NOT NULL,
				media longtext NULL,
				link varchar(2048) NOT NULL DEFAULT '',
				fields longtext NULL,
				status varchar(20) NOT NULL DEFAULT 'scheduled',
				scheduled_at datetime NOT NULL,
				attempts smallint(5) unsigned NOT NULL DEFAULT 0,
				created_by bigint(20) unsigned NOT NULL DEFAULT 0,
				created_at datetime NOT NULL,
				updated_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY status_scheduled (status, scheduled_at),
				KEY scheduled_at (scheduled_at),
				KEY post_id (post_id),
				KEY campaign_id (campaign_id),
				KEY campaign_key (campaign_key),
				KEY batch_id (batch_id)
			) {$charset};"
		);
	}

	/**
	 * Creates or updates the share log table.
	 *
	 * @param string $charset Charset and collation.
	 */
	private static function create_logs_table( string $charset ): void {
		$logs = self::logs_table();
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
				details longtext NULL,
				created_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY post_id (post_id),
				KEY queue_id (queue_id)
			) {$charset};"
		);
	}

	/**
	 * Creates or updates the campaigns table.
	 *
	 * @param string $charset Charset and collation.
	 */
	private static function create_campaigns_table( string $charset ): void {
		$campaigns = self::campaigns_table();
		dbDelta(
			"CREATE TABLE {$campaigns} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				type varchar(20) NOT NULL DEFAULT 'single',
				name varchar(191) NOT NULL DEFAULT '',
				data longtext NOT NULL,
				created_by bigint(20) unsigned NOT NULL DEFAULT 0,
				created_at datetime NOT NULL,
				updated_at datetime NOT NULL,
				PRIMARY KEY  (id)
			) {$charset};"
		);
	}

	/**
	 * Moves data from older versions to the current tables.
	 */
	private static function upgrade_data(): void {
		global $wpdb;
		$queue     = self::queue_table();
		$campaigns = self::campaigns_table();

		// Version 3: the per post type sharing rules become auto-post campaigns.
		\SocialIntegrations\Campaigns\Auto::migrate();

		// Version 4: older shares get a campaign key and a batch. Shares of one campaign and
		// post that were added in the same minute form one batch. Each other share is its own batch.
		// phpcs:disable WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query( $wpdb->prepare( "UPDATE %i q JOIN %i c ON c.id = q.campaign_id SET q.campaign_key = CONCAT(c.type, '-', c.id) WHERE q.campaign_key = ''", $queue, $campaigns ) );
		$wpdb->query( $wpdb->prepare( "UPDATE %i SET batch_id = MD5(IF(post_id > 0 OR campaign_id > 0, CONCAT(campaign_id, '|', post_id, '|', DATE_FORMAT(created_at, '%%Y-%%m-%%d %%H:%%i')), CONCAT('q', id))) WHERE batch_id = ''", $queue ) );
		// phpcs:enable
	}
}
