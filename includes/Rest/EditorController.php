<?php
/**
 * REST routes for the block editor panel.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

use SocialIntegrations\Campaigns\Auto;
use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Content\ShareBuilder;
use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Scheduler\AutoShare;
use SocialIntegrations\Scheduler\Queue;
use SocialIntegrations\Support\Dates;

defined( 'ABSPATH' ) || exit;

/**
 * What the editor panel shows for one post: whether it shares on publish, the campaigns
 * that share it, its shares, and a preview of the share.
 *
 * Anyone who can edit the post reads its state. Only a user who manages the plugin gets
 * the accounts and the preview, as on the admin screens.
 */
final class EditorController extends RestController {

	/**
	 * Registers routes.
	 */
	public function register_routes(): void {
		$this->route( '/editor/(?P<id>\d+)', \WP_REST_Server::READABLE, array( $this, 'state' ), array(), array( $this, 'can_edit' ) );
		$this->route(
			'/editor/(?P<id>\d+)/preview',
			\WP_REST_Server::CREATABLE,
			array( $this, 'preview' ),
			array(
				'title'   => array(
					'type'    => 'string',
					'default' => '',
				),
				'content' => array(
					'type'    => 'string',
					'default' => '',
				),
				'excerpt' => array(
					'type'    => 'string',
					'default' => '',
				),
				'caption' => array(
					'type'    => 'string',
					'default' => '',
				),
			)
		);
	}

	/**
	 * Permission: the user can edit this post.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public function can_edit( \WP_REST_Request $request ): bool {
		return current_user_can( 'edit_post', (int) $request['id'] );
	}

	/**
	 * The post's sharing state.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function state( \WP_REST_Request $request ) {
		$post = $this->post( (int) $request['id'] );
		if ( ! $post ) {
			return $this->error( 'not_found', __( 'This item does not exist.', 'social-integrations' ), 404 );
		}

		$names = array();
		foreach ( Accounts::all() as $account ) {
			$names[ $account['id'] ] = $account;
		}

		$campaigns = array();
		foreach ( Auto::matching( $post ) as $campaign ) {
			$campaigns[] = array(
				'id'       => (int) $campaign['id'],
				'name'     => (string) $campaign['name'],
				'delay'    => Auto::delay( $campaign ),
				'accounts' => array_values( array_intersect( (array) $campaign['accounts'], array_keys( $names ) ) ),
			);
		}

		$rows   = Queue::for_post( $post->ID );
		$logs   = Queue::last_logs( wp_list_pluck( $rows, 'id' ) );
		$shares = array();
		foreach ( $rows as $row ) {
			$account  = $names[ $row['account_id'] ] ?? array();
			$log      = $logs[ $row['id'] ] ?? null;
			$shares[] = array(
				'id'           => $row['id'],
				'network'      => (string) $row['network'],
				'account'      => (string) ( $account['name'] ?? '' ),
				'status'       => (string) $row['status'],
				'scheduled_at' => Dates::iso( $row['scheduled_at'] ),
				'message'      => $log ? (string) $log['message'] : '',
				'remote_url'   => $log ? (string) $log['remote_url'] : '',
			);
		}

		$manage = current_user_can( 'manage_options' );
		$state  = array(
			'shared'     => (bool) get_post_meta( $post->ID, AutoShare::META_SHARED, true ),
			'campaigns'  => $campaigns,
			'shares'     => $shares,
			'can_manage' => $manage,
			'accounts'   => array(),
		);
		if ( $manage ) {
			foreach ( $names as $account ) {
				$state['accounts'][] = array(
					'id'      => (string) $account['id'],
					'network' => (string) $account['network'],
					'name'    => (string) ( $account['name'] ?? '' ),
					'avatar'  => (string) ( $account['avatar'] ?? '' ),
					'status'  => (string) ( $account['status'] ?? '' ),
				);
			}
		}
		return rest_ensure_response( $state );
	}

	/**
	 * The share that the post makes with the text in the editor, which is not saved yet.
	 * It uses the template of the first campaign that shares the post.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function preview( \WP_REST_Request $request ) {
		$post = $this->post( (int) $request['id'] );
		if ( ! $post ) {
			return $this->error( 'not_found', __( 'This item does not exist.', 'social-integrations' ), 404 );
		}

		// A copy of the post with the editor's text. It keeps the ID, so terms, meta and
		// the featured image come from the post.
		$draft               = new \WP_Post( (object) $post->to_array() );
		$draft->post_title   = sanitize_text_field( (string) $request['title'] );
		$draft->post_content = wp_kses_post( (string) $request['content'] );
		$draft->post_excerpt = sanitize_textarea_field( (string) $request['excerpt'] );

		$caption = sanitize_textarea_field( (string) $request['caption'] );
		$meta    = static function ( $value, $object_id, $meta_key ) use ( $post, $caption ) {
			return (int) $object_id === $post->ID && '_sint_caption' === $meta_key ? array( $caption ) : $value;
		};
		add_filter( 'get_post_metadata', $meta, 10, 3 );

		$campaigns = Auto::matching( $draft );
		$base      = $campaigns ? Auto::template( $campaigns[0] ) : array();
		$share     = ( new ShareBuilder() )->build( $draft, array(), 'auto', $base );

		remove_filter( 'get_post_metadata', $meta, 10 );

		return rest_ensure_response(
			array(
				'caption' => $share['caption'],
				'media'   => array_values( $share['media'] ),
				'blocks'  => $share['blocks'],
			)
		);
	}

	/**
	 * A post of a shareable post type, or null.
	 *
	 * @param int $id Post ID.
	 */
	private function post( int $id ): ?\WP_Post {
		$post = get_post( $id );
		return $post && in_array( $post->post_type, PostTypes::names(), true ) ? $post : null;
	}
}
