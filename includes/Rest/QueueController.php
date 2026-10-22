<?php
/**
 * Queue routes.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

use SocialIntegrations\Campaigns\Campaigns;
use SocialIntegrations\Plugin;
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
					'title'     => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
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
		$job = Queue::find( (int) $request['id'] );
		if ( ! $job ) {
			return $this->error( 'not_found', __( 'This share does not exist.', 'social-integrations' ), 404 );
		}
		if ( ! in_array( $job['status'], array( 'draft', 'scheduled', 'failed' ), true ) ) {
			return $this->error( 'sent', __( 'This share has already been sent.', 'social-integrations' ), 409 );
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
			return $this->error( 'sending', __( 'This share is being sent now.', 'social-integrations' ), 409 );
		}

		if ( $draft ) {
			return rest_ensure_response( array( 'item' => Queue::find( $job['id'] ) ) );
		}
		if ( empty( $body['scheduled_at'] ) ) {
			if ( ! Queue::claim( $job['id'] ) ) {
				return $this->error( 'sending', __( 'This share is being sent now.', 'social-integrations' ), 409 );
			}
			$publisher = new Publisher( Plugin::instance()->networks );
			return rest_ensure_response( array( 'result' => $publisher->send( Queue::find( $job['id'] ) ) ) );
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
		$job = Queue::find( (int) $request['id'] );
		if ( ! $job ) {
			return $this->error( 'not_found', __( 'This share does not exist.', 'social-integrations' ), 404 );
		}
		if ( 'sending' === $job['status'] ) {
			return $this->error( 'sending', __( 'This share is being sent now.', 'social-integrations' ), 409 );
		}
		Queue::delete( $job['id'] );
		return rest_ensure_response( array( 'deleted' => true ) );
	}

	/**
	 * Sends a failed share again, now.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function retry( \WP_REST_Request $request ) {
		$job = Queue::find( (int) $request['id'] );
		if ( ! $job ) {
			return $this->error( 'not_found', __( 'This share does not exist.', 'social-integrations' ), 404 );
		}
		Queue::update(
			$job['id'],
			array(
				'status'       => 'scheduled',
				'scheduled_at' => current_time( 'mysql', true ),
			)
		);
		if ( ! Queue::claim( $job['id'] ) ) {
			return $this->error( 'sending', __( 'This share is being sent now.', 'social-integrations' ), 409 );
		}
		$publisher = new Publisher( Plugin::instance()->networks );
		return rest_ensure_response( $publisher->send( Queue::find( $job['id'] ) ) );
	}

	/**
	 * Share log.
	 */
	public function logs(): \WP_REST_Response {
		$rows = Queue::logs( array(), 200 );
		foreach ( $rows as &$row ) {
			$post              = $row['post_id'] ? get_post( (int) $row['post_id'] ) : null;
			$row['post_title'] = $post ? html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ) : '';
			$row['created_at'] = \SocialIntegrations\Support\Dates::iso( $row['created_at'] );
		}
		unset( $row );
		return rest_ensure_response( $rows );
	}
}
