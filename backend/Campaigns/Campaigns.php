<?php
/**
 * Campaigns: what the composer makes.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Campaigns;

use SocialIntegrations\Content\PostFields;
use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Database\Migrations;
use SocialIntegrations\Hooks;
use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Plugin;
use SocialIntegrations\Scheduler\Publisher;
use SocialIntegrations\Scheduler\Queue;
use SocialIntegrations\Support\Capabilities;
use SocialIntegrations\Support\Dates;

defined( 'ABSPATH' ) || exit;

/**
 * A single campaign is one post from the composer: its text, media and time, and the
 * queue rows that share it, one per account. It keeps what the composer sent, so a user
 * can edit or duplicate it later. Auto-post campaigns (see Auto) share new posts on
 * publish; their rows link to them the same way.
 */
final class Campaigns {

	/**
	 * Queue statuses not sent yet. When a user edits or deletes a campaign, the plugin
	 * replaces or removes these rows. Rows already sent stay in the share log.
	 */
	const UNSENT = array( 'draft', 'scheduled', 'failed' );

	/**
	 * Checks a composer body.
	 *
	 * @param array $body Body.
	 * @return \WP_Error|null
	 */
	public static function check( array $body ): ?\WP_Error {
		$post_id = (int) ( $body['post_id'] ?? 0 );
		if ( $post_id && ! PostTypes::post( $post_id ) ) {
			return new \WP_Error( 'sint_not_found', __( 'This item does not exist.', 'social-integrations' ), array( 'status' => 404 ) );
		}
		if ( ! array_filter( (array) ( $body['accounts'] ?? array() ) ) ) {
			return new \WP_Error( 'sint_no_accounts', __( 'Select at least one account.', 'social-integrations' ), array( 'status' => 400 ) );
		}
		if ( ! Accounts::can_use( array_map( 'sanitize_key', (array) $body['accounts'] ) ) ) {
			return self::not_allowed();
		}
		if ( ! empty( $body['scheduled_at'] ) && ! strtotime( (string) $body['scheduled_at'] ) ) {
			return new \WP_Error( 'sint_bad_date', __( 'Enter a valid date and time.', 'social-integrations' ), array( 'status' => 400 ) );
		}
		return null;
	}

	/**
	 * What a single campaign keeps from a composer body, sanitized.
	 *
	 * @param array $body Body.
	 */
	private static function data( array $body ): array {
		$captions = array();
		foreach ( (array) ( $body['captions'] ?? array() ) as $network => $text ) {
			$captions[ sanitize_key( (string) $network ) ] = sanitize_textarea_field( (string) $text );
		}
		$post_id = (int) ( $body['post_id'] ?? 0 );
		return array(
			'post_id'      => $post_id,
			'caption'      => sanitize_textarea_field( (string) ( $body['caption'] ?? '' ) ),
			'captions'     => $captions,
			'accounts'     => array_values( array_filter( array_map( 'sanitize_key', (array) ( $body['accounts'] ?? array() ) ) ) ),
			'media'        => self::media( $body['media'] ?? array() ),
			'link'         => esc_url_raw( (string) ( $body['link'] ?? ( $post_id ? get_permalink( $post_id ) : '' ) ) ),
			// What the user set, with '*' values, so the composer opens the campaign as it was.
			'fields'       => PostFields::clean( $body['fields'] ?? array() ),
			// The final values of each network, which the composer builds from the post.
			'field_values' => PostFields::clean( $body['field_values'] ?? array() ),
			'scheduled_at' => empty( $body['scheduled_at'] ) ? '' : gmdate( 'c', (int) strtotime( (string) $body['scheduled_at'] ) ),
			// A user who cannot publish saves drafts only.
			'draft'        => ! empty( $body['draft'] ) || ! current_user_can( Capabilities::PUBLISH ),
			'options'      => (array) ( $body['options'] ?? array() ),
		);
	}

	/**
	 * A name for a single campaign: its item's title, or the start of its caption.
	 *
	 * @param array $data Campaign data.
	 */
	private static function name( array $data ): string {
		if ( $data['post_id'] ) {
			return PostTypes::title( $data['post_id'] );
		}
		$text = trim( preg_replace( '/\s+/', ' ', $data['caption'] ) );
		return mb_strlen( $text ) > 60 ? mb_substr( $text, 0, 59 ) . '…' : $text;
	}

	/**
	 * Adds a single campaign and shares it.
	 *
	 * @param array $body Composer body, checked.
	 * @return array ['id', 'created', 'results'?].
	 */
	public static function create( array $body ): array {
		$data = self::data( $body );
		$id   = self::insert( 'single', mb_substr( self::name( $data ), 0, 191 ), $data );
		$out  = array( 'id' => $id ) + self::share( $data, $id );
		do_action( Hooks::CAMPAIGN_SAVED, $id, 'single', ! $data['draft'], true );
		return $out;
	}

	/**
	 * Adds a campaign row for the current user.
	 *
	 * @param string $type Campaign type, for example 'single' or 'auto'.
	 * @param string $name Campaign name.
	 * @param array  $data Campaign data, stored as JSON.
	 * @return int The ID of the new campaign.
	 */
	public static function insert( string $type, string $name, array $data ): int {
		global $wpdb;
		$now = current_time( 'mysql', true );
		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			Migrations::campaigns_table(),
			array(
				'type'       => $type,
				'name'       => $name,
				'data'       => wp_json_encode( $data ),
				'created_by' => get_current_user_id(),
				'created_at' => $now,
				'updated_at' => $now,
			)
		);
		return (int) $wpdb->insert_id;
	}

	/**
	 * Replaces a single campaign with a new composer body: the plugin removes its unsent
	 * shares and adds the new ones. Shares already sent stay in the log.
	 *
	 * @param int   $id   Campaign ID.
	 * @param array $body Composer body, checked.
	 * @return array|null ['id', 'created', 'results'?], or null when there is no such campaign.
	 */
	public static function update( int $id, array $body ): ?array {
		global $wpdb;
		$current = self::get( $id );
		if ( ! $current || 'single' !== $current['type'] ) {
			return null;
		}
		$data = self::data( $body );
		self::remove_unsent( $id );
		$wpdb->update( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			Migrations::campaigns_table(),
			array(
				'name'       => mb_substr( self::name( $data ), 0, 191 ),
				'data'       => wp_json_encode( $data ),
				'updated_at' => current_time( 'mysql', true ),
			),
			array( 'id' => $id )
		);
		$out = array( 'id' => $id ) + self::share( $data, $id );
		do_action( Hooks::CAMPAIGN_SAVED, $id, 'single', ! $data['draft'], false );
		return $out;
	}

	/**
	 * Deletes a campaign and its unsent shares.
	 *
	 * @param int $id Campaign ID.
	 */
	public static function delete( int $id ): void {
		global $wpdb;
		self::remove_unsent( $id );
		$queue = Migrations::queue_table();
		$wpdb->query( $wpdb->prepare( 'UPDATE %i SET campaign_id = 0 WHERE campaign_id = %d', $queue, $id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->delete( Migrations::campaigns_table(), array( 'id' => $id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	}

	/**
	 * The number of campaigns on the Campaigns screen that list an account, of every type.
	 *
	 * @param string $account_id Account ID.
	 */
	public static function count_using( string $account_id ): int {
		$n = 0;
		foreach ( self::all() as $item ) {
			if ( in_array( $account_id, (array) ( $item['accounts'] ?? array() ), true ) ) {
				++$n;
			}
		}
		return $n;
	}

	/**
	 * Removes an account from the single and auto-post campaigns. An empty list means "every
	 * account", so a campaign that loses its last account gets 'no_accounts' instead, and an
	 * auto-post campaign also stops. The user selects accounts again in the campaign.
	 *
	 * @param string $account_id Account ID.
	 * @return int The number of campaigns that changed.
	 */
	public static function forget_account( string $account_id ): int {
		global $wpdb;
		$table   = Migrations::campaigns_table();
		$like    = '%' . $wpdb->esc_like( '"' . $account_id . '"' ) . '%';
		$rows    = $wpdb->get_results( $wpdb->prepare( "SELECT id, type, data FROM %i WHERE type IN ('single', 'auto') AND data LIKE %s", $table, $like ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$changed = 0;
		foreach ( (array) $rows as $row ) {
			$data = json_decode( (string) $row['data'], true );
			if ( ! is_array( $data ) || ! in_array( $account_id, (array) ( $data['accounts'] ?? array() ), true ) ) {
				continue;
			}
			$data['accounts'] = array_values( array_diff( (array) $data['accounts'], array( $account_id ) ) );
			if ( ! $data['accounts'] ) {
				$data['no_accounts'] = true;
				if ( 'auto' === $row['type'] ) {
					$data['active'] = false;
				}
			}
			$wpdb->update( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
				$table,
				array(
					'data'       => wp_json_encode( $data ),
					'updated_at' => current_time( 'mysql', true ),
				),
				array( 'id' => (int) $row['id'] )
			);
			++$changed;
		}
		return $changed;
	}

	/**
	 * One single campaign as the composer reads it, or null.
	 *
	 * @param int $id Campaign ID.
	 */
	public static function get( int $id ): ?array {
		global $wpdb;
		$table = Migrations::campaigns_table();
		$row   = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i WHERE id = %d', $table, $id ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! $row ) {
			return null;
		}
		$data = json_decode( (string) $row['data'], true );
		return array(
			'id'   => (int) $row['id'],
			'type' => (string) $row['type'],
			'name' => (string) $row['name'],
		) + ( is_array( $data ) ? $data : array() );
	}

	/**
	 * The error for an account that the current user cannot use.
	 */
	public static function not_allowed(): \WP_Error {
		return new \WP_Error( 'sint_account_not_allowed', __( 'You cannot share to one or more of the selected accounts. Select only your accounts.', 'social-integrations' ), array( 'status' => 403 ) );
	}

	/**
	 * Whether the current user can see and change a campaign: the user can use every account
	 * of the campaign. A campaign without accounts shares to every account.
	 *
	 * @param array $campaign A campaign from get() or all().
	 */
	public static function visible( array $campaign ): bool {
		return Accounts::can_use( (array) ( $campaign['accounts'] ?? array() ) );
	}

	/**
	 * The campaigns of all() that the current user can see.
	 */
	public static function visible_all(): array {
		return array_values( array_filter( self::all(), array( self::class, 'visible' ) ) );
	}

	/**
	 * Every campaign, for the Campaigns screen, the newest first.
	 *
	 * An item: [ 'id', 'type', 'name', 'accounts' (empty: all), 'no_accounts' (true: the last
	 * account was disconnected, so it shares to none), 'status', 'next_at', 'last_at', 'sent',
	 * 'total', 'updated_at', 'created_by' (user ID), 'author' (the user's name, empty when the
	 * user does not exist now), 'actions' => string[] ].
	 */
	public static function all(): array {
		global $wpdb;
		$table = Migrations::campaigns_table();
		$rows  = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM %i ORDER BY updated_at DESC LIMIT 200', $table ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$stats = self::queue_stats( array_map( 'intval', array_column( (array) $rows, 'id' ) ) );
		$items = array();
		foreach ( (array) $rows as $row ) {
			$items[] = self::list_item( $row, $stats[ (int) $row['id'] ] ?? array() );
		}

		$items = (array) apply_filters( Hooks::CAMPAIGNS, $items );
		foreach ( $items as &$item ) {
			$user           = ! empty( $item['created_by'] ) ? get_userdata( (int) $item['created_by'] ) : false;
			$item['author'] = $user ? (string) $user->display_name : '';
		}
		unset( $item );
		return $items;
	}

	/**
	 * Queue counts and dates of some campaigns, by campaign ID and status.
	 *
	 * @param int[] $ids Campaign IDs.
	 * @return array<int, array<string, array>> [ campaign_id => [ status => [ 'n', 'first_at', 'last_at' ] ] ].
	 */
	private static function queue_stats( array $ids ): array {
		global $wpdb;
		$stats = array();
		if ( ! $ids ) {
			return $stats;
		}
		$queue = Migrations::queue_table();
		$in    = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
		$found = $wpdb->get_results( $wpdb->prepare( "SELECT campaign_id, status, COUNT(*) AS n, MIN(scheduled_at) AS first_at, MAX(updated_at) AS last_at FROM %i WHERE campaign_id IN ({$in}) GROUP BY campaign_id, status", array_merge( array( $queue ), $ids ) ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		foreach ( (array) $found as $stat ) {
			$stats[ (int) $stat['campaign_id'] ][ $stat['status'] ] = $stat;
		}
		return $stats;
	}

	/**
	 * One campaign as the Campaigns screen lists it.
	 *
	 * @param array $row Campaigns table row.
	 * @param array $by  Queue stats of the campaign, by status.
	 */
	private static function list_item( array $row, array $by ): array {
		$data  = json_decode( (string) $row['data'], true );
		$data  = is_array( $data ) ? $data : array();
		$total = array_sum( array_map( 'intval', array_column( $by, 'n' ) ) );
		if ( 'auto' === $row['type'] ) {
			$on      = ! isset( $data['active'] ) || ! empty( $data['active'] );
			$name    = (string) $row['name'];
			$status  = $on ? 'active' : 'paused';
			$actions = array( 'edit', 'duplicate', 'delete', $on ? 'pause' : 'resume' );
		} else {
			$name    = '' !== $row['name'] ? (string) $row['name'] : __( '(no caption)', 'social-integrations' );
			$status  = self::single_status( $by, $total );
			$actions = array( 'edit', 'duplicate', 'delete' );
		}
		return array(
			'id'          => (int) $row['id'],
			'type'        => (string) $row['type'],
			'name'        => $name,
			'accounts'    => array_values( (array) ( $data['accounts'] ?? array() ) ),
			'no_accounts' => ! empty( $data['no_accounts'] ),
			'status'      => $status,
			'next_at'     => isset( $by['scheduled'] ) ? Dates::iso( $by['scheduled']['first_at'] ) : '',
			'last_at'     => isset( $by['published'] ) ? Dates::iso( $by['published']['last_at'] ) : '',
			'sent'        => (int) ( $by['published']['n'] ?? 0 ),
			'total'       => $total,
			'updated_at'  => Dates::iso( $row['updated_at'] ),
			'created_by'  => (int) $row['created_by'],
			'actions'     => $actions,
		);
	}

	/**
	 * The status of a single campaign, from its queue rows.
	 *
	 * @param array $by    Queue stats of the campaign, by status.
	 * @param int   $total Number of queue rows.
	 */
	private static function single_status( array $by, int $total ): string {
		$count = static function ( string $status ) use ( $by ): int {
			return (int) ( $by[ $status ]['n'] ?? 0 );
		};
		if ( $count( 'scheduled' ) || $count( 'sending' ) ) {
			return 'scheduled';
		}
		if ( $count( 'failed' ) ) {
			return 'failed';
		}
		if ( $count( 'draft' ) ) {
			return 'draft';
		}
		return $total ? 'published' : 'ended';
	}

	/**
	 * Adds one queue row per account and sends them now, unless the campaign is a draft
	 * or set for later.
	 *
	 * @param array $data Campaign data.
	 * @param int   $id   Campaign ID.
	 * @return array ['created' => int[], 'results'?].
	 */
	private static function share( array $data, int $id ): array {
		$when    = '' === $data['scheduled_at'] ? time() : (int) strtotime( $data['scheduled_at'] );
		$batch   = Queue::batch();
		$created = array();
		foreach ( $data['accounts'] as $account_id ) {
			$account = Accounts::get( $account_id );
			if ( ! $account ) {
				continue;
			}
			$created[] = Queue::add(
				array(
					'post_id'      => $data['post_id'],
					'campaign_id'  => $id,
					'campaign_key' => 'single-' . $id,
					'batch_id'     => $batch,
					'network'      => $account['network'],
					'account_id'   => $account_id,
					'caption'      => $data['captions'][ $account['network'] ] ?? $data['caption'],
					'media'        => $data['media'],
					'link'         => $data['link'],
					'fields'       => PostFields::for_network( $account['network'], isset( $data['field_values'][ $account['network'] ] ) ? $data['field_values'] : $data['fields'] ),
					'status'       => $data['draft'] ? 'draft' : 'scheduled',
					'scheduled_at' => gmdate( 'Y-m-d H:i:s', $when ),
				)
			);
		}

		do_action( Hooks::SHARES_CREATED, $created, $data['options'] );

		if ( $data['draft'] ) {
			return array( 'created' => $created );
		}

		// "Now" sends during this request, so the person sees the result immediately and
		// the share does not depend on WP-Cron. Later times wait for the scheduler.
		if ( '' === $data['scheduled_at'] ) {
			$publisher = new Publisher( Plugin::instance()->networks );
			$results   = array();
			foreach ( $created as $row_id ) {
				if ( Queue::claim( $row_id ) ) {
					$job       = Queue::find( $row_id );
					$results[] = array(
						'account_id' => $job['account_id'],
						'network'    => $job['network'],
					) + $publisher->send( $job );
				}
			}
			return array(
				'created' => $created,
				'results' => $results,
			);
		}

		Publisher::wake_at( $when );
		return array( 'created' => $created );
	}

	/**
	 * Deletes a campaign's shares that are not sent yet.
	 *
	 * @param int $id Campaign ID.
	 */
	private static function remove_unsent( int $id ): void {
		global $wpdb;
		$queue  = Migrations::queue_table();
		$status = implode( ',', array_fill( 0, count( self::UNSENT ), '%s' ) );
		$wpdb->query( $wpdb->prepare( "DELETE FROM %i WHERE campaign_id = %d AND status IN ({$status})", array_merge( array( $queue, $id ), self::UNSENT ) ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- One %s for each status.
	}

	/**
	 * Media items from a request body, sanitized.
	 *
	 * @param mixed $items Raw media list.
	 */
	public static function media( $items ): array {
		$media = array();
		foreach ( (array) $items as $item ) {
			$media[] = array(
				'type' => 'video' === ( $item['type'] ?? '' ) ? 'video' : 'image',
				'id'   => (int) ( $item['id'] ?? 0 ),
				'url'  => esc_url_raw( (string) ( $item['url'] ?? '' ) ),
				'alt'  => sanitize_text_field( (string) ( $item['alt'] ?? '' ) ),
			);
		}
		return $media;
	}
}
