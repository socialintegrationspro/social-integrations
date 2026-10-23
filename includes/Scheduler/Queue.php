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
	 * @param array $data ['post_id', 'network', 'account_id', 'caption', 'media', 'link', 'status', 'scheduled_at' (UTC 'Y-m-d H:i:s'),
	 *                    'campaign_key' ("{type}-{id}" of the campaign that adds it), 'batch_id' (see batch())].
	 * @return int Row ID.
	 */
	public static function add( array $data ): int {
		global $wpdb;
		$now = current_time( 'mysql', true );
		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			Migrations::queue_table(),
			array(
				'post_id'      => (int) ( $data['post_id'] ?? 0 ),
				'campaign_id'  => (int) ( $data['campaign_id'] ?? 0 ),
				'campaign_key' => substr( preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) ( $data['campaign_key'] ?? '' ) ) ), 0, 64 ),
				'batch_id'     => preg_match( '/^[a-f0-9]{32}$/', (string) ( $data['batch_id'] ?? '' ) ) ? $data['batch_id'] : self::batch(),
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
			array( '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s' )
		);
		return (int) $wpdb->insert_id;
	}

	/**
	 * A new batch ID. Shares of one post that are added together get the same batch, so the
	 * share log shows them as one entry.
	 */
	public static function batch(): string {
		return str_replace( '-', '', wp_generate_uuid4() );
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
	 * @param int         $id     Row ID.
	 * @param array       $fields Column => value.
	 * @param string|null $status Only change the row while it still has this status.
	 * @return bool Whether a row changed.
	 */
	public static function update( int $id, array $fields, ?string $status = null ): bool {
		global $wpdb;
		if ( isset( $fields['media'] ) && is_array( $fields['media'] ) ) {
			$fields['media'] = wp_json_encode( array_values( $fields['media'] ) );
		}
		$fields['updated_at'] = current_time( 'mysql', true );
		$where                = null === $status ? array( 'id' => $id ) : array(
			'id'     => $id,
			'status' => $status,
		);
		return 1 === (int) $wpdb->update( Migrations::queue_table(), $fields, $where ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
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
				'details'    => empty( $result['details'] ) ? null : wp_json_encode( $result['details'] ),
				'created_at' => current_time( 'mysql', true ),
			)
		);
	}

	/**
	 * Every try of the share that one log row belongs to, the oldest first, with what the
	 * network answered. A log row without a queue row is its only try.
	 *
	 * @param int $log_id Log row ID.
	 * @return array[]|null Null when the row does not exist.
	 */
	public static function log_tries( int $log_id ): ?array {
		global $wpdb;
		$table = Migrations::logs_table();
		// phpcs:disable WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT id, queue_id FROM {$table} WHERE id = %d", $log_id ), ARRAY_A );
		if ( ! $row ) {
			return null;
		}
		$rows = (int) $row['queue_id']
			? $wpdb->get_results( $wpdb->prepare( "SELECT id, status, message, remote_url, details, created_at FROM {$table} WHERE queue_id = %d ORDER BY id ASC", (int) $row['queue_id'] ), ARRAY_A )
			: $wpdb->get_results( $wpdb->prepare( "SELECT id, status, message, remote_url, details, created_at FROM {$table} WHERE id = %d", $log_id ), ARRAY_A );
		// phpcs:enable
		$tries = array();
		foreach ( (array) $rows as $try ) {
			$details = json_decode( (string) $try['details'], true );
			$tries[] = array(
				'id'         => (int) $try['id'],
				'status'     => (string) $try['status'],
				'message'    => (string) $try['message'],
				'remote_url' => (string) $try['remote_url'],
				'created_at' => $try['created_at'],
				'details'    => is_array( $details ) ? $details : null,
			);
		}
		return $tries;
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
	 * One page of the share log, as entries: the shares of one batch, newest entry first.
	 * Each share is its newest log row, with the number of times it was tried.
	 *
	 * @param array $args [ 'page' => int, 'per_page' => int, 'campaign' => campaign key,
	 *                    'status' => '' | 'failed', 'search' => string, 'from' / 'to' => UTC 'Y-m-d H:i:s' ].
	 * @return array [ 'total' => int, 'entries' => [ batch_id => share rows ] ].
	 */
	public static function log_entries( array $args ): array {
		global $wpdb;
		$logs  = Migrations::logs_table();
		$queue = Migrations::queue_table();
		// A log row without a queue row stands alone, as its own share and batch.
		$shares = "SELECT l.id, l.queue_id, l.post_id, l.network, l.account_id, l.status, l.message, l.remote_url, l.created_at, t.tries,
				COALESCE(NULLIF(q.batch_id, ''), CONCAT('l', l.id)) AS batch_id, COALESCE(q.campaign_key, '') AS campaign_key, COALESCE(q.caption, '') AS caption
			FROM {$logs} l
			JOIN (SELECT MAX(id) AS id, COUNT(*) AS tries FROM {$logs} GROUP BY IF(queue_id > 0, CONCAT('q', queue_id), CONCAT('l', id))) t ON t.id = l.id
			LEFT JOIN {$queue} q ON q.id = l.queue_id
			LEFT JOIN {$wpdb->posts} p ON p.ID = l.post_id";
		$where  = array();
		$params = array();
		if ( '' !== ( $args['campaign'] ?? '' ) ) {
			$where[]  = "COALESCE(q.campaign_key, '') = %s";
			$params[] = $args['campaign'];
		}
		if ( 'failed' === ( $args['status'] ?? '' ) ) {
			$where[] = "l.status = 'failed'";
		}
		if ( '' !== ( $args['search'] ?? '' ) ) {
			$like     = '%' . $wpdb->esc_like( $args['search'] ) . '%';
			$where[]  = '(p.post_title LIKE %s OR q.caption LIKE %s)';
			$params[] = $like;
			$params[] = $like;
		}
		if ( '' !== ( $args['from'] ?? '' ) ) {
			$where[]  = 'l.created_at >= %s';
			$params[] = $args['from'];
		}
		if ( '' !== ( $args['to'] ?? '' ) ) {
			$where[]  = 'l.created_at < %s';
			$params[] = $args['to'];
		}
		$sql = $shares . ( $where ? ' WHERE ' . implode( ' AND ', $where ) : '' );
		if ( $params ) {
			$sql = $wpdb->prepare( $sql, $params ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		}

		// phpcs:disable WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
		$total   = (int) $wpdb->get_var( "SELECT COUNT(DISTINCT batch_id) FROM ({$sql}) s" );
		$per     = max( 1, (int) ( $args['per_page'] ?? 10 ) );
		$offset  = ( max( 1, (int) ( $args['page'] ?? 1 ) ) - 1 ) * $per;
		$batches = $wpdb->get_col( $wpdb->prepare( "SELECT batch_id FROM ({$sql}) s GROUP BY batch_id ORDER BY MAX(id) DESC LIMIT %d OFFSET %d", $per, $offset ) );
		$entries = array();
		if ( $batches ) {
			$in = implode( ',', array_map( array( $wpdb, 'prepare' ), array_fill( 0, count( $batches ), '%s' ), $batches ) );
			foreach ( (array) $wpdb->get_results( "SELECT * FROM ({$sql}) s WHERE batch_id IN ({$in}) ORDER BY id DESC", ARRAY_A ) as $row ) {
				$entries[ $row['batch_id'] ][] = $row;
			}
		}
		// phpcs:enable
		// Keep the order of the page: the newest entry first.
		$ordered = array();
		foreach ( $batches as $batch ) {
			$ordered[ $batch ] = $entries[ $batch ] ?? array();
		}
		return array(
			'total'   => $total,
			'entries' => $ordered,
		);
	}

	/**
	 * Deletes share log entries: every log row of their shares. The shares stay in the queue.
	 *
	 * @param string[] $keys Entry keys from log_entries(): a batch ID, or 'l' and a log row ID.
	 * @return int Rows deleted.
	 */
	public static function delete_log_entries( array $keys ): int {
		global $wpdb;
		$logs    = Migrations::logs_table();
		$queue   = Migrations::queue_table();
		$batches = array();
		$ids     = array();
		foreach ( $keys as $key ) {
			$key = (string) $key;
			if ( preg_match( '/^[a-f0-9]{32}$/', $key ) ) {
				$batches[] = $key;
			} elseif ( preg_match( '/^l(\d+)$/', $key, $m ) ) {
				$ids[] = (int) $m[1];
			}
		}
		$deleted = 0;
		// phpcs:disable WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( $batches ) {
			$in       = implode( ',', array_map( static fn( $b ) => "'" . $b . "'", $batches ) );
			$deleted += (int) $wpdb->query( "DELETE l FROM {$logs} l JOIN {$queue} q ON q.id = l.queue_id WHERE q.batch_id IN ({$in})" );
		}
		if ( $ids ) {
			$deleted += (int) $wpdb->query( "DELETE FROM {$logs} WHERE id IN (" . implode( ',', $ids ) . ')' );
		}
		// phpcs:enable
		return $deleted;
	}

	/**
	 * Deletes log rows older than some days.
	 *
	 * @param int $days Days to keep.
	 * @return int Rows deleted.
	 */
	public static function prune_logs( int $days ): int {
		global $wpdb;
		if ( $days < 1 ) {
			return 0;
		}
		$table = Migrations::logs_table();
		return (int) $wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE created_at < %s", gmdate( 'Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS ) ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}

	/**
	 * The newest log row for each share, keyed by queue ID.
	 *
	 * @param int[] $queue_ids Queue IDs.
	 */
	public static function last_logs( array $queue_ids ): array {
		global $wpdb;
		if ( ! $queue_ids ) {
			return array();
		}
		$table = Migrations::logs_table();
		$ids   = implode( ',', array_map( 'intval', $queue_ids ) );
		$rows  = $wpdb->get_results( "SELECT * FROM {$table} WHERE id IN (SELECT MAX(id) FROM {$table} WHERE queue_id IN ({$ids}) GROUP BY queue_id)", ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$logs  = array();
		foreach ( (array) $rows as $row ) {
			$logs[ (int) $row['queue_id'] ] = $row;
		}
		return $logs;
	}

	/**
	 * Decodes JSON columns and casts numbers.
	 *
	 * @param array $row Raw row.
	 */
	private static function hydrate( array $row ): array {
		$row['id']       = (int) $row['id'];
		$row['post_id']  = (int) $row['post_id'];
		$row['campaign_id'] = (int) ( $row['campaign_id'] ?? 0 );
		$row['attempts'] = (int) $row['attempts'];
		$media           = json_decode( (string) $row['media'], true );
		$row['media']    = is_array( $media ) ? $media : array();
		return $row;
	}
}
