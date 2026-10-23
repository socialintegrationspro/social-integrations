<?php
/**
 * Block editor support.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Editor;

use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Networks\Accounts;
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
		// The caption and the accounts change what a share sends and where, so only a user who
		// manages the plugin sets them. Turning sharing off for a post only stops a share, so
		// anyone who can edit the post can do it.
		$manage   = static function () {
			return current_user_can( 'manage_options' );
		};
		$own_post = static function ( $allowed, $meta_key, $post_id ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundBeforeLastUsed -- WordPress passes these first.
			return current_user_can( 'edit_post', (int) $post_id );
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
					'auth_callback' => $own_post,
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
					'auth_callback'     => $manage,
				)
			);
			register_post_meta(
				$type,
				AutoShare::META_ACCOUNTS,
				array(
					'type'              => 'array',
					'single'            => true,
					'default'           => array(),
					'show_in_rest'      => array(
						'schema' => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
					),
					'sanitize_callback' => array( self::class, 'sanitize_accounts' ),
					'auth_callback'     => $manage,
				)
			);
		}
	}

	/**
	 * Keeps only the IDs of connected accounts.
	 *
	 * @param mixed $value Raw meta value.
	 */
	public static function sanitize_accounts( $value ): array {
		$known = array_column( Accounts::all(), 'id' );
		return array_values( array_intersect( array_map( 'strval', (array) $value ), $known ) );
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
