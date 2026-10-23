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
 * The plugin stores dates in UTC.
 */
final class Queue {

	const STATUSES = array( 'draft', 'scheduled', 'sending', 'published', 'failed' );

	/**
	 * Adds one share for one account.
	 *
	 * @param array $data ['post_id', 'network', 'account_id', 'caption', 'media', 'link', 'fields' (filled post fields of
	 *                    the network: name => value), 'status', 'scheduled_at' (UTC 'Y-m-d H:i:s'),
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
				'fields'       => wp_json_encode( (object) ( $data['fields'] ?? array() ) ),
				'status'       => in_array( $data['status'] ?? '', self::STATUSES, true ) ? $data['status'] : 'scheduled',
				'scheduled_at' => (string) ( $data['scheduled_at'] ?? $now ),
				'created_by'   => get_current_user_id(),
				'created_at'   => $now,
				'updated_at'   => $now,
			),
			array( '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s' )
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
	 * @param string        $from     UTC 'Y-m-d H:i:s'.
	 * @param string        $to       UTC 'Y-m-d H:i:s'.
	 * @param string[]|null $accounts Only rows of these accounts. Null: every account.
	 */
	public static function between( string $from, string $to, ?array $accounts = null ): array {
		global $wpdb;
		$table = Migrations::queue_table();
		$rows  = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare( "SELECT * FROM {$table} WHERE scheduled_at >= %s AND scheduled_at < %s", $from, $to ) . self::accounts_where( $accounts, 'account_id' ) . ' ORDER BY scheduled_at ASC LIMIT 500', // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
			ARRAY_A
		);
		return array_map( array( self::class, 'hydrate' ), (array) $rows );
	}

	/**
	 * The newest shares of one post, newest first.
	 *
	 * @param int           $post_id  Post ID.
	 * @param int           $limit    Maximum rows.
	 * @param string[]|null $accounts Only rows of these accounts. Null: every account.
	 */
	public static function for_post( int $post_id, int $limit = 20, ?array $accounts = null ): array {
		global $wpdb;
		$table = Migrations::queue_table();
		$rows  = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare( "SELECT * FROM {$table} WHERE post_id = %d", $post_id ) . self::accounts_where( $accounts, 'account_id' ) . $wpdb->prepare( ' ORDER BY scheduled_at DESC, id DESC LIMIT %d', $limit ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
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
		if ( isset( $fields['fields'] ) && is_array( $fields['fields'] ) ) {
			$fields['fields'] = wp_json_encode( (object) $fields['fields'] );
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
	 * @param int           $log_id   Log row ID.
	 * @param string[]|null $accounts Only a row of these accounts. Null: every account.
	 * @return array[]|null Null when the row does not exist.
	 */
	public static function log_tries( int $log_id, ?array $accounts = null ): ?array {
		global $wpdb;
		$table = Migrations::logs_table();
		// phpcs:disable WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT id, queue_id, account_id FROM {$table} WHERE id = %d", $log_id ), ARRAY_A );
		if ( ! $row || ( null !== $accounts && ! in_array( (string) $row['account_id'], $accounts, true ) ) ) {
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
	 * Latest log rows of some posts.
	 *
	 * @param int[]         $post_ids Post IDs. Empty gives no rows.
	 * @param int           $limit    Maximum rows.
	 * @param string[]|null $accounts Only rows of these accounts. Null: every account.
	 */
	public static function logs( array $post_ids, int $limit = 100, ?array $accounts = null ): array {
		global $wpdb;
		if ( ! $post_ids ) {
			return array();
		}
		$table = Migrations::logs_table();
		$ids   = implode( ',', array_map( 'intval', $post_ids ) );
		$rows  = $wpdb->get_results( "SELECT * FROM {$table} WHERE post_id IN ({$ids})" . self::accounts_where( $accounts, 'account_id' ) . $wpdb->prepare( ' ORDER BY id DESC LIMIT %d', $limit ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
		return (array) $rows;
	}

	/**
	 * The entry key of a log row: its batch ID, or 'l' and the row ID when the row has no batch.
	 */
	const LOG_BATCH = "COALESCE(NULLIF(q.batch_id, ''), CONCAT('l', l.id))";

	/**
	 * One page of the share log, as entries: the shares of one batch, newest entry first.
	 * Each share is its newest log row, with the number of times it was tried.
	 *
	 * @param array $args [ 'page' => int, 'per_page' => int, 'campaign' => campaign key,
	 *                    'status' => '' | 'failed', 'search' => string, 'from' / 'to' => UTC 'Y-m-d H:i:s',
	 *                    'accounts' => string[] | null (only shares of these accounts; null: every account) ].
	 * @return array [ 'total' => int, 'entries' => [ batch_id => share rows ] ].
	 */
	public static function log_entries( array $args ): array {
		global $wpdb;
		$shares = self::log_shares_sql( $args );
		$batch  = self::LOG_BATCH;
		$per    = max( 1, (int) ( $args['per_page'] ?? 10 ) );
		$offset = ( max( 1, (int) ( $args['page'] ?? 1 ) ) - 1 ) * $per;

		// phpcs:disable WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
		// The alias is not a column name: GROUP BY uses a column before an alias of the same name.
		$batches = $wpdb->get_col( $wpdb->prepare( "SELECT {$batch} AS entry_key {$shares} GROUP BY entry_key ORDER BY MAX(l.id) DESC LIMIT %d OFFSET %d", $per, $offset ) );
		$entries = array();
		if ( $batches ) {
			// The rows of this page only: a batch ID comes from the queue row, an 'l' key is a log row ID.
			$ids  = array();
			$keys = array();
			foreach ( $batches as $key ) {
				if ( preg_match( '/^l(\d+)$/', $key, $m ) ) {
					$ids[] = (int) $m[1];
				} else {
					$keys[] = $wpdb->prepare( '%s', $key );
				}
			}
			$in   = array();
			$in[] = $keys ? 'q.batch_id IN (' . implode( ',', $keys ) . ')' : '';
			$in[] = $ids ? 'l.id IN (' . implode( ',', $ids ) . ')' : '';
			$rows = $wpdb->get_results(
				// `reconnect`: the sign-in expired, or the network refused the first comment. A LIKE test
				// avoids reading the details, which hold the request trace, for each row of the page.
				"SELECT l.id, l.queue_id, l.post_id, l.network, l.account_id, l.status, l.message, l.remote_url, l.created_at, t.tries,
					( l.details LIKE '%\"reconnect\":true%' OR l.details LIKE '%\"code\":\"expired\"%' ) AS reconnect,
					{$batch} AS batch_id, COALESCE(q.campaign_key, '') AS campaign_key, COALESCE(q.caption, '') AS caption
				{$shares} AND (" . implode( ' OR ', array_filter( $in ) ) . ') ORDER BY l.id DESC',
				ARRAY_A
			);
			foreach ( (array) $rows as $row ) {
				$entries[ $row['batch_id'] ][] = $row;
			}
		}
		// phpcs:enable
		// Keep the order of the page: the newest entry first.
		$ordered = array();
		foreach ( $batches as $key ) {
			$ordered[ $key ] = $entries[ $key ] ?? array();
		}
		return array(
			'total'   => self::count_log_entries( $args ),
			'entries' => $ordered,
		);
	}

	/**
	 * The number of share log entries that match the filters of log_entries().
	 *
	 * @param array $args The filters of log_entries().
	 */
	public static function count_log_entries( array $args ): int {
		global $wpdb;
		$batch = self::LOG_BATCH;
		return (int) $wpdb->get_var( "SELECT COUNT(DISTINCT {$batch}) " . self::log_shares_sql( $args ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
	}

	/**
	 * FROM and WHERE for the share log rows that match the filters: one row for each share,
	 * which is its newest log row, with the number of tries in t.tries. A log row without
	 * a queue row is its own share.
	 *
	 * @param array $args The filters of log_entries(): 'campaign', 'status', 'search', 'from', 'to', 'accounts'.
	 * @return string Prepared SQL.
	 */
	private static function log_shares_sql( array $args ): string {
		global $wpdb;
		$logs   = Migrations::logs_table();
		$queue  = Migrations::queue_table();
		$search = (string) ( $args['search'] ?? '' );
		// The newest row of each queue row comes from the queue_id index. Only a search reads the post title.
		$sql    = "FROM {$logs} l
			JOIN (
				SELECT MAX(id) AS id, COUNT(*) AS tries FROM {$logs} WHERE queue_id > 0 GROUP BY queue_id
				UNION ALL
				SELECT id, 1 FROM {$logs} WHERE queue_id = 0
			) t ON t.id = l.id
			LEFT JOIN {$queue} q ON q.id = l.queue_id"
			. ( '' !== $search ? " LEFT JOIN {$wpdb->posts} p ON p.ID = l.post_id" : '' );
		$where  = array( '1 = 1' );
		$params = array();
		if ( '' !== ( $args['campaign'] ?? '' ) ) {
			$where[]  = "COALESCE(q.campaign_key, '') = %s";
			$params[] = $args['campaign'];
		}
		if ( 'failed' === ( $args['status'] ?? '' ) ) {
			$where[] = "l.status = 'failed'";
		}
		if ( '' !== $search ) {
			$like     = '%' . $wpdb->esc_like( $search ) . '%';
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
		$sql .= ' WHERE ' . implode( ' AND ', $where );
		if ( $params ) {
			$sql = $wpdb->prepare( $sql, $params ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		}
		return $sql . self::accounts_where( $args['accounts'] ?? null, 'l.account_id' );
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
			$deleted += (int) $wpdb->query( $wpdb->prepare( "DELETE l FROM {$logs} l JOIN {$queue} q ON q.id = l.queue_id WHERE q.batch_id IN (" . implode( ',', array_fill( 0, count( $batches ), '%s' ) ) . ')', $batches ) );
		}
		if ( $ids ) {
			$deleted += (int) $wpdb->query( $wpdb->prepare( "DELETE FROM {$logs} WHERE id IN (" . implode( ',', array_fill( 0, count( $ids ), '%d' ) ) . ')', $ids ) );
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
	 * Sent and failed shares since a date, counted for each day and network. A share counts
	 * on the day that it became due.
	 *
	 * @param string        $from     UTC 'Y-m-d H:i:s'.
	 * @param int           $offset   Seconds to add to UTC to get the site's time.
	 * @param string[]|null $accounts Only shares of these accounts. Null: every account.
	 * @return array Rows [ 'day' => site 'Y-m-d', 'network', 'status' => 'published' | 'failed', 'n' ].
	 */
	public static function activity( string $from, int $offset, ?array $accounts = null ): array {
		global $wpdb;
		$table = Migrations::queue_table();
		$rows  = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare( "SELECT DATE(DATE_ADD(scheduled_at, INTERVAL %d SECOND)) AS day, network, status, COUNT(*) AS n FROM {$table} WHERE scheduled_at >= %s AND status IN ('published', 'failed')", $offset, $from ) . self::accounts_where( $accounts, 'account_id' ) . ' GROUP BY day, network, status', // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
			ARRAY_A
		);
		return (array) $rows;
	}

	/**
	 * The number of shares with each status.
	 *
	 * @param string[]|null $accounts Only shares of these accounts. Null: every account.
	 * @return array<string, int> [ status => count ].
	 */
	public static function status_counts( ?array $accounts = null ): array {
		global $wpdb;
		$table  = Migrations::queue_table();
		$counts = array_fill_keys( self::STATUSES, 0 );
		foreach ( (array) $wpdb->get_results( "SELECT status, COUNT(*) AS n FROM {$table} WHERE 1 = 1" . self::accounts_where( $accounts, 'account_id' ) . ' GROUP BY status', ARRAY_A ) as $row ) { // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
			$counts[ $row['status'] ] = (int) $row['n'];
		}
		return $counts;
	}

	/**
	 * The next scheduled shares, the soonest first.
	 *
	 * @param int           $limit    Maximum rows.
	 * @param string[]|null $accounts Only shares of these accounts. Null: every account.
	 */
	public static function upcoming( int $limit = 6, ?array $accounts = null ): array {
		global $wpdb;
		$table = Migrations::queue_table();
		$rows  = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare( "SELECT * FROM {$table} WHERE status = 'scheduled' AND scheduled_at >= %s", current_time( 'mysql', true ) ) . self::accounts_where( $accounts, 'account_id' ) . $wpdb->prepare( ' ORDER BY scheduled_at ASC, id ASC LIMIT %d', $limit ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
			ARRAY_A
		);
		return array_map( array( self::class, 'hydrate' ), (array) $rows );
	}

	/**
	 * The newest log rows, the newest first.
	 *
	 * @param int           $limit    Maximum rows.
	 * @param string[]|null $accounts Only rows of these accounts. Null: every account.
	 */
	public static function recent_logs( int $limit = 8, ?array $accounts = null ): array {
		global $wpdb;
		$table = Migrations::logs_table();
		$rows  = $wpdb->get_results( "SELECT id, queue_id, post_id, network, account_id, status, message, remote_url, created_at FROM {$table} WHERE 1 = 1" . self::accounts_where( $accounts, 'account_id' ) . $wpdb->prepare( ' ORDER BY id DESC LIMIT %d', $limit ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQL.NotPrepared
		return (array) $rows;
	}

	/**
	 * SQL that keeps only rows of some accounts, to add after a WHERE clause.
	 *
	 * @param string[]|null $accounts Account IDs. Null: every account, so no condition.
	 * @param string        $column   The account column, for example 'l.account_id'.
	 */
	private static function accounts_where( ?array $accounts, string $column ): string {
		global $wpdb;
		if ( null === $accounts ) {
			return '';
		}
		if ( ! $accounts ) {
			return ' AND 1 = 0';
		}
		$in = array();
		foreach ( $accounts as $id ) {
			$in[] = $wpdb->prepare( '%s', (string) $id );
		}
		return " AND {$column} IN (" . implode( ',', $in ) . ')';
	}

	/**
	 * Decodes JSON columns and casts numbers.
	 *
	 * @param array $row Raw row.
	 */
	private static function hydrate( array $row ): array {
		$row['id']          = (int) $row['id'];
		$row['post_id']     = (int) $row['post_id'];
		$row['campaign_id'] = (int) ( $row['campaign_id'] ?? 0 );
		$row['attempts']    = (int) $row['attempts'];
		$media              = json_decode( (string) $row['media'], true );
		$row['media']       = is_array( $media ) ? $media : array();
		$values             = json_decode( (string) ( $row['fields'] ?? '' ), true );
		$row['fields']      = is_array( $values ) ? $values : array();
		return $row;
	}
}
