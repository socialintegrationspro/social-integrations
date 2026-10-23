<?php
/**
 * Queue routes.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

use SocialIntegrations\Campaigns\Campaigns;
use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Scheduler\Publisher;
use SocialIntegrations\Scheduler\Queue;

defined( 'ABSPATH' ) || exit;

/**
 * Calendar data, new and edited shares from the composer, retry and delete, and the share log.
 */
final class QueueController extends RestController {

	/**
	 * Registers routes.
	 */
	public function register_routes(): void {
		$this->route(
			'/queue',
			\WP_REST_Server::READABLE,
			array( $this, 'index' ),
			array(
				'from' => array(
					'type'     => 'string',
					'required' => true,
				),
				'to'   => array(
					'type'     => 'string',
					'required' => true,
				),
			)
		);
		$this->route( '/queue', \WP_REST_Server::CREATABLE, array( $this, 'create' ) );
		$this->route( '/queue/(?P<id>\d+)', \WP_REST_Server::EDITABLE, array( $this, 'update' ) );
		$this->route( '/queue/(?P<id>\d+)', \WP_REST_Server::DELETABLE, array( $this, 'delete' ) );
		$this->route( '/queue/(?P<id>\d+)/retry', \WP_REST_Server::CREATABLE, array( $this, 'retry' ) );
		$this->route( '/logs', \WP_REST_Server::READABLE, array( $this, 'logs' ) );
		$this->route( '/logs/(?P<id>\d+)/tries', \WP_REST_Server::READABLE, array( $this, 'log_tries' ) );
		$this->route( '/logs/delete', \WP_REST_Server::CREATABLE, array( $this, 'delete_logs' ) );
	}

	/**
	 * Shares between two dates (ISO 8601).
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public function index( \WP_REST_Request $request ): \WP_REST_Response {
		$from = gmdate( 'Y-m-d H:i:s', (int) strtotime( (string) $request['from'] ) );
		$to   = gmdate( 'Y-m-d H:i:s', (int) strtotime( (string) $request['to'] ) );
		$rows = Queue::between( $from, $to );

		$titles = array();
		$logs   = Queue::last_logs( wp_list_pluck( $rows, 'id' ) );
		foreach ( $rows as &$row ) {
			$post_id = (int) $row['post_id'];
			if ( $post_id && ! isset( $titles[ $post_id ] ) ) {
				$post               = get_post( $post_id );
				$titles[ $post_id ] = $post ? array(
					'title'     => PostTypes::title( $post ),
					'type'      => $post->post_type,
					'thumbnail' => (string) get_the_post_thumbnail_url( $post, 'thumbnail' ),
					'edit_link' => (string) get_edit_post_link( $post, 'raw' ),
				) : null;
			}
			$log                 = $logs[ $row['id'] ] ?? null;
			$row['post']         = $post_id ? $titles[ $post_id ] : null;
			$row['message']      = $log ? (string) $log['message'] : '';
			$row['remote_url']   = $log ? (string) $log['remote_url'] : '';
			$row['scheduled_at'] = \SocialIntegrations\Support\Dates::iso( $row['scheduled_at'] );
		}
		unset( $row );

		return rest_ensure_response( $rows );
	}

	/**
	 * Adds shares from the composer: one row for each account.
	 *
	 * Body: { post_id?, caption, captions?: {network: caption}, accounts: string[],
	 * media?: array, link?, scheduled_at?: ISO 8601 (empty = now), draft?: bool }.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function create( \WP_REST_Request $request ) {
		$body  = (array) $request->get_json_params();
		$error = Campaigns::check( $body );
		return $error ? $error : rest_ensure_response( Campaigns::create( $body ) );
	}

	/**
	 * Changes a draft, scheduled or failed share, and sends it now when asked.
	 *
	 * Body: { caption?, media?: array, scheduled_at?: ISO 8601 (empty = now), draft?: bool }.
	 * Fields left out keep their value.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update( \WP_REST_Request $request ) {
		$job = $this->job( $request );
		if ( is_wp_error( $job ) ) {
			return $job;
		}
		if ( ! in_array( $job['status'], array( 'draft', 'scheduled', 'failed' ), true ) ) {
			return $this->error( 'sent', __( 'The plugin sent this share already.', 'social-integrations' ), 409 );
		}

		$body = (array) $request->get_json_params();
		$when = empty( $body['scheduled_at'] ) ? time() : strtotime( (string) $body['scheduled_at'] );
		if ( ! $when ) {
			return $this->error( 'bad_date', __( 'Enter a valid date and time.', 'social-integrations' ) );
		}

		$draft  = ! empty( $body['draft'] );
		$fields = array(
			'status'       => $draft ? 'draft' : 'scheduled',
			'scheduled_at' => gmdate( 'Y-m-d H:i:s', $when ),
		);
		if ( isset( $body['caption'] ) ) {
			$fields['caption'] = sanitize_textarea_field( (string) $body['caption'] );
		}
		if ( isset( $body['media'] ) ) {
			$fields['media'] = Campaigns::media( $body['media'] );
		}
		// The scheduler may have claimed the row since it was read.
		if ( ! Queue::update( $job['id'], $fields, $job['status'] ) ) {
			return $this->error( 'sending', __( 'The plugin sends this share now.', 'social-integrations' ), 409 );
		}

		if ( $draft ) {
			return rest_ensure_response( array( 'item' => Queue::find( $job['id'] ) ) );
		}
		if ( empty( $body['scheduled_at'] ) ) {
			$result = Publisher::send_now( $job['id'] );
			if ( null === $result ) {
				return $this->error( 'sending', __( 'The plugin sends this share now.', 'social-integrations' ), 409 );
			}
			return rest_ensure_response( array( 'result' => $result ) );
		}

		Publisher::wake_at( $when );
		return rest_ensure_response( array( 'item' => Queue::find( $job['id'] ) ) );
	}

	/**
	 * Deletes a share that has not been sent.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function delete( \WP_REST_Request $request ) {
		$job = $this->job( $request );
		if ( is_wp_error( $job ) ) {
			return $job;
		}
		if ( 'sending' === $job['status'] ) {
			return $this->error( 'sending', __( 'The plugin sends this share now.', 'social-integrations' ), 409 );
		}
		Queue::delete( $job['id'] );
		return rest_ensure_response( array( 'deleted' => true ) );
	}

	/**
	 * The queue row that the request names, or a 404 error.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	private function job( \WP_REST_Request $request ) {
		$job = Queue::find( (int) $request['id'] );
		return $job ? $job : $this->not_found( __( 'This share does not exist.', 'social-integrations' ) );
	}

	/**
	 * Sends a failed share again, now.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function retry( \WP_REST_Request $request ) {
		$job = $this->job( $request );
		if ( is_wp_error( $job ) ) {
			return $job;
		}
		// Only a failed share goes again, so a sent share or one that is being sent is not
		// posted twice.
		$reset = Queue::update(
			$job['id'],
			array(
				'status'       => 'scheduled',
				'scheduled_at' => current_time( 'mysql', true ),
			),
			'failed'
		);
		if ( ! $reset ) {
			return $this->error( 'not_failed', __( 'You can send only a failed share again.', 'social-integrations' ), 409 );
		}
		$result = Publisher::send_now( $job['id'] );
		if ( null === $result ) {
			return $this->error( 'sending', __( 'The plugin sends this share now.', 'social-integrations' ), 409 );
		}
		return rest_ensure_response( $result );
	}

	/**
	 * One page of the share log. Query: page, per_page (10, 20 or 30), campaign (a campaign
	 * key), status ('failed' or empty), search, from and to (site dates, 'Y-m-d').
	 *
	 * Response: { total, failed (entries with a failed share), items: entries, campaigns: [ { key, name, type } ] }. An entry is the
	 * shares of one batch: one post that one campaign shared to its accounts.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public function logs( \WP_REST_Request $request ): \WP_REST_Response {
		$args = $this->log_args( $request );
		$page = Queue::log_entries( $args );
		// How many entries have a failed share, with the same other filters, for the Failed button.
		$failed = 'failed' === $args['status'] ? $page['total'] : Queue::log_entries(
			array(
				'status'   => 'failed',
				'page'     => 1,
				'per_page' => 1,
			) + $args
		)['total'];

		$items = array();
		foreach ( $page['entries'] as $batch => $shares ) {
			$items[] = $this->log_item( (string) $batch, $shares );
		}

		return rest_ensure_response(
			array(
				'total'     => $page['total'],
				'failed'    => $failed,
				'items'     => $items,
				'campaigns' => $this->campaign_names(),
			)
		);
	}

	/**
	 * The share log filters from the query, sanitized.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	private function log_args( \WP_REST_Request $request ): array {
		$day = static function ( $value, string $add = '' ): string {
			$value = (string) $value;
			if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $value ) ) {
				return '';
			}
			// Site dates become UTC; 'to' covers the whole day.
			return get_gmt_from_date( $add ? gmdate( 'Y-m-d', (int) strtotime( $value . ' ' . $add ) ) . ' 00:00:00' : $value . ' 00:00:00' );
		};
		return array(
			'page'     => max( 1, (int) $request['page'] ),
			'per_page' => in_array( (int) $request['per_page'], array( 10, 20, 30 ), true ) ? (int) $request['per_page'] : 10,
			'campaign' => sanitize_text_field( (string) $request['campaign'] ),
			'status'   => 'failed' === $request['status'] ? 'failed' : '',
			'search'   => sanitize_text_field( (string) $request['search'] ),
			'from'     => $day( $request['from'] ),
			'to'       => $day( $request['to'], '+1 day' ),
		);
	}

	/**
	 * Names of every campaign, from the Campaigns screen list, so other plugins' types have theirs.
	 *
	 * @return array[] [ { key, name, type } ].
	 */
	private function campaign_names(): array {
		$campaigns = array();
		foreach ( Campaigns::all() as $campaign ) {
			$campaigns[ $campaign['type'] . '-' . $campaign['id'] ] = array(
				'key'  => $campaign['type'] . '-' . $campaign['id'],
				'name' => (string) $campaign['name'],
				'type' => (string) $campaign['type'],
			);
		}
		return array_values( $campaigns );
	}

	/**
	 * One share log entry: the shares of one batch.
	 *
	 * @param string $batch  Batch key.
	 * @param array  $shares Share rows of the batch.
	 */
	private function log_item( string $batch, array $shares ): array {
		$first   = $shares[0];
		$post_id = (int) $first['post_id'];
		$post    = $post_id ? get_post( $post_id ) : null;
		$text    = trim( (string) preg_replace( '/\s+/', ' ', (string) $first['caption'] ) );
		return array(
			'key'          => $batch,
			'campaign_key' => (string) $first['campaign_key'],
			'post_id'      => $post_id,
			'post_title'   => $post ? PostTypes::title( $post ) : '',
			'edit_url'     => $post ? (string) get_edit_post_link( $post, 'raw' ) : '',
			'excerpt'      => mb_strlen( $text ) > 80 ? mb_substr( $text, 0, 79 ) . '…' : $text,
			'at'           => \SocialIntegrations\Support\Dates::iso( $first['created_at'] ),
			'shares'       => array_map(
				static function ( array $row ): array {
					return array(
						'id'         => (int) $row['id'],
						'queue_id'   => (int) $row['queue_id'],
						'network'    => (string) $row['network'],
						'account_id' => (string) $row['account_id'],
						'status'     => (string) $row['status'],
						'message'    => (string) $row['message'],
						'remote_url' => (string) $row['remote_url'],
						'created_at' => \SocialIntegrations\Support\Dates::iso( $row['created_at'] ),
						'tries'      => (int) $row['tries'],
					);
				},
				$shares
			),
		);
	}

	/**
	 * Every try of one share, with what the network answered, for developers.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function log_tries( \WP_REST_Request $request ) {
		$tries = Queue::log_tries( (int) $request['id'] );
		if ( null === $tries ) {
			return $this->not_found( __( 'This log entry does not exist.', 'social-integrations' ) );
		}
		foreach ( $tries as &$try ) {
			$try['created_at'] = \SocialIntegrations\Support\Dates::iso( $try['created_at'] );
		}
		unset( $try );
		return rest_ensure_response( $tries );
	}

	/**
	 * Deletes share log entries. Body: { keys: string[] } (entry keys, at most 100).
	 * The shares stay in the calendar; only their log rows go.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function delete_logs( \WP_REST_Request $request ) {
		$keys = array_slice( array_map( 'strval', (array) ( $request->get_json_params()['keys'] ?? array() ) ), 0, 100 );
		if ( ! $keys ) {
			return $this->error( 'no_keys', __( 'Select at least one entry.', 'social-integrations' ), 400 );
		}
		return rest_ensure_response( array( 'deleted' => Queue::delete_log_entries( $keys ) ) );
	}
}
