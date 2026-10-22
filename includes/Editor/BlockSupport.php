<?php
/**
 * Block editor support.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Editor;

use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Scheduler\AutoShare;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the post meta the editor panel edits, and the `sintSocial` block
 * attribute that holds the per-block choice from the block toolbar.
 */
final class BlockSupport {

	/**
	 * Registers hooks.
	 */
	public function register(): void {
		add_action( 'init', array( $this, 'register_meta' ), 20 );
		add_filter( 'register_block_type_args', array( $this, 'add_block_attribute' ), 10, 1 );
	}

	/**
	 * Post meta for every shareable post type.
	 */
	public function register_meta(): void {
		$auth = static function () {
			return current_user_can( 'edit_posts' );
		};
		foreach ( PostTypes::names() as $type ) {
			register_post_meta(
				$type,
				AutoShare::META_DISABLED,
				array(
					'type'          => 'boolean',
					'single'        => true,
					'default'       => false,
					'show_in_rest'  => true,
					'auth_callback' => $auth,
				)
			);
			register_post_meta(
				$type,
				'_sint_caption',
				array(
					'type'              => 'string',
					'single'            => true,
					'default'           => '',
					'show_in_rest'      => true,
					'sanitize_callback' => 'sanitize_textarea_field',
					'auth_callback'     => $auth,
				)
			);
			register_post_meta(
				$type,
				AutoShare::META_ACCOUNTS,
				array(
					'type'          => 'array',
					'single'        => true,
					'default'       => array(),
					'show_in_rest'  => array(
						'schema' => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
					),
					'auth_callback' => $auth,
				)
			);
		}
	}

	/**
	 * Lets every block keep the `sintSocial` attribute when rendered on the server.
	 *
	 * @param array $args Block type arguments.
	 */
	public function add_block_attribute( array $args ): array {
		$args['attributes']               = isset( $args['attributes'] ) && is_array( $args['attributes'] ) ? $args['attributes'] : array();
		$args['attributes']['sintSocial'] = array(
			'type'    => 'object',
			'default' => array(),
		);
		return $args;
	}
}
