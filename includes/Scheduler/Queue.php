<?php
/**
 * Share queue storage.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Scheduler;

use SocialIntegrations\Database\Migrations;

defined( 'ABSPATH' ) || exit;

/**
 * Reads and writes rows of `{prefix}sint_queue` and `{prefix}sint_logs`.
 * Dates are stored in UTC.
 */
final class Queue {

	const STATUSES = array( 'draft', 'scheduled', 'sending', 'published', 'failed' );

	/**
	 * Adds one share for one account.
	 *
	 * @param array $data ['post_id', 'network', 'account_id', 'caption', 'media', 'link', 'status', 'scheduled_at' (UTC 'Y-m-d H:i:s')].
	 * @return int Row ID.
	 */
	public static function add( array $data ): int {
		global $wpdb;
		$now = current_time( 'mysql', true );
		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			Migrations::queue_table(),
			array(
				'post_id'      => (int) ( $data['post_id'] ?? 0 ),
				'network'      => sanitize_key( (string) $data['network'] ),
				'account_id'   => sanitize_key( (string) $data['account_id'] ),
				'caption'      => (string) ( $data['caption'] ?? '' ),
				'media'        => wp_json_encode( array_values( (array) ( $data['media'] ?? array() ) ) ),
				'link'         => esc_url_raw( (string) ( $data['link'] ?? '' ) ),
				'status'       => in_array( $data['status'] ?? '', self::STATUSES, true ) ? $data['status'] : 'scheduled',
				'scheduled_at' => (string) ( $data['scheduled_at'] ?? $now ),
				'created_by'   => get_current_user_id(),
				'created_at'   => $now,
				'updated_at'   => $now,
			),
			array( '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s' )
		);
		return (int) $wpdb->insert_id;
	}

	/**
	 * One row, or null.
	 *
	 * @param int $id Row ID.
	 */
	public static function find( int $id ): ?array {
		global $wpdb;
		$table = Migrations::queue_table();
		$row   = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return $row ? self::hydrate( $row ) : null;
	}

	/**
	 * Rows scheduled between two UTC dates.
	 *
	 * @param string $from UTC 'Y-m-d H:i:s'.
	 * @param string $to   UTC 'Y-m-d H:i:s'.
	 */
	public static function between( string $from, string $to ): array {
		global $wpdb;
		$table = Migrations::queue_table();
		$rows  = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare( "SELECT * FROM {$table} WHERE scheduled_at >= %s AND scheduled_at < %s ORDER BY scheduled_at ASC LIMIT 500", $from, $to ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			ARRAY_A
		);
		return array_map( array( self::class, 'hydrate' ), (array) $rows );
	}

	/**
	 * Due rows, oldest first.
	 *
	 * @param int $limit Maximum rows.
	 */
	public static function due( int $limit = 10 ): array {
		global $wpdb;
		$table = Migrations::queue_table();
		$rows  = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare( "SELECT * FROM {$table} WHERE status = 'scheduled' AND scheduled_at <= %s ORDER BY scheduled_at ASC LIMIT %d", current_time( 'mysql', true ), $limit ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			ARRAY_A
		);
		return array_map( array( self::class, 'hydrate' ), (array) $rows );
	}

	/**
	 * Changes fields of a row.
	 *
	 * @param int   $id     Row ID.
	 * @param array $fields Column => value.
	 */
	public static function update( int $id, array $fields ): void {
		global $wpdb;
		if ( isset( $fields['media'] ) && is_array( $fields['media'] ) ) {
			$fields['media'] = wp_json_encode( array_values( $fields['media'] ) );
		}
		$fields['updated_at'] = current_time( 'mysql', true );
		$wpdb->update( Migrations::queue_table(), $fields, array( 'id' => $id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	}

	/**
	 * Claims a row for sending, so two runners never send it twice.
	 *
	 * @param int $id Row ID.
	 */
	public static function claim( int $id ): bool {
		global $wpdb;
		$table = Migrations::queue_table();
		$done  = $wpdb->query( $wpdb->prepare( "UPDATE {$table} SET status = 'sending', attempts = attempts + 1, updated_at = %s WHERE id = %d AND status = 'scheduled'", current_time( 'mysql', true ), $id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return 1 === (int) $done;
	}

	/**
	 * Deletes a row.
	 *
	 * @param int $id Row ID.
	 */
	public static function delete( int $id ): bool {
		global $wpdb;
		return (bool) $wpdb->delete( Migrations::queue_table(), array( 'id' => $id ), array( '%d' ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	}

	/**
	 * Writes a share log row.
	 *
	 * @param array $job    Queue row.
	 * @param array $result ['status', 'message', 'remote_id', 'remote_url'].
	 */
	public static function log( array $job, array $result ): void {
		global $wpdb;
		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			Migrations::logs_table(),
			array(
				'queue_id'   => (int) $job['id'],
				'post_id'    => (int) $job['post_id'],
				'network'    => (string) $job['network'],
				'account_id' => (string) $job['account_id'],
				'status'     => (string) $result['status'],
				'message'    => (string) ( $result['message'] ?? '' ),
				'remote_id'  => (string) ( $result['remote_id'] ?? '' ),
				'remote_url' => esc_url_raw( (string) ( $result['remote_url'] ?? '' ) ),
				'created_at' => current_time( 'mysql', true ),
			)
		);
	}

	/**
	 * Latest log rows, optionally for some posts.
	 *
	 * @param int[] $post_ids Post IDs, or empty for all.
	 * @param int   $limit    Maximum rows.
	 */
	public static function logs( array $post_ids = array(), int $limit = 100 ): array {
		global $wpdb;
		$table = Migrations::logs_table();
		if ( $post_ids ) {
			$ids  = implode( ',', array_map( 'intval', $post_ids ) );
			$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE post_id IN ({$ids}) ORDER BY id DESC LIMIT %d", $limit ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		} else {
			$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} ORDER BY id DESC LIMIT %d", $limit ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		}
		return (array) $rows;
	}

	/**
	 * Decodes JSON columns and casts numbers.
	 *
	 * @param array $row Raw row.
	 */
	private static function hydrate( array $row ): array {
		$row['id']       = (int) $row['id'];
		$row['post_id']  = (int) $row['post_id'];
		$row['attempts'] = (int) $row['attempts'];
		$media           = json_decode( (string) $row['media'], true );
		$row['media']    = is_array( $media ) ? $media : array();
		return $row;
	}
}
