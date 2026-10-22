<?php
/**
 * Content routes.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Content\ShareBuilder;
use SocialIntegrations\Hooks;
use SocialIntegrations\Support\Settings;
use SocialIntegrations\Scheduler\AutoShare;
use SocialIntegrations\Scheduler\Queue;

defined( 'ABSPATH' ) || exit;

/**
 * Lists site content of every public post type, and builds the share for one item.
 */
final class ContentController extends RestController {

	/**
	 * Registers routes.
	 */
	public function register_routes(): void {
		$this->route( '/post-types', \WP_REST_Server::READABLE, array( $this, 'post_types' ) );
		$this->route(
			'/content',
			\WP_REST_Server::READABLE,
			array( $this, 'index' ),
			array(
				'type'     => array(
					'type'    => 'string',
					'default' => 'any',
				),
				'search'   => array(
					'type'    => 'string',
					'default' => '',
				),
				'status'   => array(
					'type'    => 'string',
					'default' => 'publish',
					'enum'    => array( 'publish', 'future', 'draft', 'any' ),
				),
				'page'     => array(
					'type'    => 'integer',
					'default' => 1,
					'minimum' => 1,
				),
				'per_page' => array(
					'type'    => 'integer',
					'default' => 20,
					'minimum' => 1,
					'maximum' => 100,
				),
			)
		);
		$this->route( '/content/(?P<id>\d+)/share', \WP_REST_Server::READABLE, array( $this, 'share' ) );
		$this->route( '/content/(?P<id>\d+)/share', \WP_REST_Server::CREATABLE, array( $this, 'share_with' ) );
	}

	/**
	 * Public post types.
	 */
	public function post_types(): \WP_REST_Response {
		return rest_ensure_response( array_values( PostTypes::all() ) );
	}

	/**
	 * Content list.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public function index( \WP_REST_Request $request ): \WP_REST_Response {
		$types = PostTypes::names();
		$type  = (string) $request['type'];
		$query = new \WP_Query(
			array(
				'post_type'           => 'any' === $type ? $types : ( in_array( $type, $types, true ) ? $type : 'post' ),
				'post_status'         => 'any' === $request['status'] ? array( 'publish', 'future', 'draft' ) : $request['status'],
				's'                   => (string) $request['search'],
				'paged'               => (int) $request['page'],
				'posts_per_page'      => (int) $request['per_page'],
				'orderby'             => 'date',
				'order'               => 'DESC',
				'ignore_sticky_posts' => true,
				'no_found_rows'       => false,
			)
		);

		$ids  = wp_list_pluck( $query->posts, 'ID' );
		$logs = array();
		foreach ( Queue::logs( $ids, 500 ) as $log ) {
			$key = $log['post_id'] . ':' . $log['account_id'];
			if ( ! isset( $logs[ $key ] ) ) {
				$logs[ $key ] = $log;
			}
		}

		$items = array();
		foreach ( $query->posts as $post ) {
			$shares = array();
			foreach ( $logs as $key => $log ) {
				if ( (int) $log['post_id'] === $post->ID ) {
					$shares[] = array(
						'account_id' => $log['account_id'],
						'network'    => $log['network'],
						'status'     => $log['status'],
						'message'    => $log['message'],
						'remote_url' => $log['remote_url'],
						'date'       => \SocialIntegrations\Support\Dates::iso( $log['created_at'] ),
					);
				}
			}
			$items[] = array(
				'id'        => $post->ID,
				'title'     => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
				'type'      => $post->post_type,
				'status'    => $post->post_status,
				'date'      => \SocialIntegrations\Support\Dates::iso( $post->post_date_gmt && '0000-00-00 00:00:00' !== $post->post_date_gmt ? $post->post_date_gmt : $post->post_date ),
				'link'      => get_permalink( $post ),
				'edit_link' => get_edit_post_link( $post, 'raw' ),
				'author'    => get_the_author_meta( 'display_name', (int) $post->post_author ),
				'thumbnail' => (string) get_the_post_thumbnail_url( $post, 'thumbnail' ),
				'auto'      => ! get_post_meta( $post->ID, AutoShare::META_DISABLED, true ),
				'shares'    => $shares,
			);
		}

		$response = rest_ensure_response( $items );
		$response->header( 'X-WP-Total', (string) $query->found_posts );
		$response->header( 'X-WP-TotalPages', (string) $query->max_num_pages );
		return $response;
	}

	/**
	 * The share built for one item.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function share( \WP_REST_Request $request ) {
		$post = get_post( (int) $request['id'] );
		if ( ! $post || ! in_array( $post->post_type, PostTypes::names(), true ) ) {
			return $this->error( 'not_found', __( 'This item does not exist.', 'social-integrations' ), 404 );
		}
		// `media` picks another media source for this build only, as the composer asks for it.
		$media = sanitize_key( (string) $request['media'] );
		if ( ! in_array( $media, ShareBuilder::MEDIA_SOURCES, true ) || 'custom' === $media ) {
			return rest_ensure_response( ( new ShareBuilder() )->build( $post ) );
		}
		$use = static function ( $template ) use ( $media ) {
			return array( 'media' => $media ) + (array) $template;
		};
		add_filter( Hooks::SHARE_TEMPLATE, $use, 1000 );
		$share = ( new ShareBuilder() )->build( $post );
		remove_filter( Hooks::SHARE_TEMPLATE, $use, 1000 );
		return rest_ensure_response( $share );
	}

	/**
	 * The share a post type template, not saved yet, builds for one item.
	 *
	 * Body: { template: { template, captions, media, custom_media } }, as a post type rule holds them.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function share_with( \WP_REST_Request $request ) {
		$post = get_post( (int) $request['id'] );
		if ( ! $post || ! in_array( $post->post_type, PostTypes::names(), true ) ) {
			return $this->error( 'not_found', __( 'This item does not exist.', 'social-integrations' ), 404 );
		}
		$input = (array) ( ( (array) $request->get_json_params() )['template'] ?? array() );
		$media = (string) ( $input['media'] ?? 'auto' );
		$draft = array(
			'caption'      => sanitize_textarea_field( (string) ( $input['template'] ?? '' ) ),
			'captions'     => Settings::captions( (array) ( $input['captions'] ?? array() ) ),
			'media'        => in_array( $media, ShareBuilder::MEDIA_SOURCES, true ) ? $media : 'auto',
			'custom_media' => Settings::media_items( (array) ( $input['custom_media'] ?? array() ) ),
		);
		$use   = static function () use ( $draft ) {
			return $draft;
		};
		add_filter( Hooks::SHARE_TEMPLATE, $use, 1000 );
		$share = ( new ShareBuilder() )->build( $post );
		remove_filter( Hooks::SHARE_TEMPLATE, $use, 1000 );
		return rest_ensure_response( $share );
	}
}
