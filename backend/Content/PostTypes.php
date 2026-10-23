<?php
/**
 * Post types the plugin can share.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Content;

use SocialIntegrations\Hooks;

defined( 'ABSPATH' ) || exit;

/**
 * Lists every public post type, built-in or registered by a plugin or theme.
 */
final class PostTypes {

	/**
	 * Post types that never have a page worth sharing.
	 */
	const EXCLUDED = array( 'attachment', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation', 'wp_font_family', 'wp_font_face' );

	/**
	 * Public post types, keyed by name.
	 *
	 * @return array<string, array> ['name', 'label', 'singular', 'source', 'builtin', 'count'].
	 */
	public static function all(): array {
		$types = array();
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $name => $object ) {
			if ( in_array( $name, self::EXCLUDED, true ) ) {
				continue;
			}
			$counts         = wp_count_posts( $name );
			$types[ $name ] = array(
				'name'     => $name,
				'label'    => $object->labels->name,
				'singular' => $object->labels->singular_name,
				'source'   => self::source( $object ),
				'builtin'  => (bool) $object->_builtin,
				'count'    => isset( $counts->publish ) ? (int) $counts->publish : 0,
				'icon'     => is_string( $object->menu_icon ) ? $object->menu_icon : '',
			);
		}
		return apply_filters( Hooks::POST_TYPES, $types );
	}

	/**
	 * Names of the public post types.
	 *
	 * @return string[]
	 */
	public static function names(): array {
		return array_keys( self::all() );
	}

	/**
	 * A post of a post type that the plugin can share, or null.
	 *
	 * @param int $id Post ID.
	 */
	public static function post( int $id ): ?\WP_Post {
		$post = get_post( $id );
		return $post && in_array( $post->post_type, self::names(), true ) ? $post : null;
	}

	/**
	 * Who registered the post type, as a short label.
	 *
	 * @param \WP_Post_Type $post_type Post type.
	 */
	private static function source( \WP_Post_Type $post_type ): string {
		if ( $post_type->_builtin ) {
			return 'WordPress';
		}
		$known = array(
			'product'      => 'WooCommerce',
			'tribe_events' => 'The Events Calendar',
			'download'     => 'Easy Digital Downloads',
			'course'       => 'LMS',
			'lp_course'    => 'LearnPress',
			'sfwd-courses' => 'LearnDash',
			'job_listing'  => 'WP Job Manager',
		);
		if ( isset( $known[ $post_type->name ] ) ) {
			return $known[ $post_type->name ];
		}
		return __( 'Custom', 'social-integrations' );
	}
}
