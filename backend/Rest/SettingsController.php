<?php
/**
 * Settings routes.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

use SocialIntegrations\Support\Capabilities;
use SocialIntegrations\Support\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Reads and saves settings, and lists the registered block types.
 */
final class SettingsController extends RestController {

	/**
	 * Registers routes.
	 */
	public function register_routes(): void {
		$this->route( '/settings', \WP_REST_Server::READABLE, array( $this, 'show' ), array(), Capabilities::VIEW );
		$this->route( '/settings', \WP_REST_Server::EDITABLE, array( $this, 'update' ), array(), Capabilities::MANAGE_SETTINGS );
		$this->route( '/blocks', \WP_REST_Server::READABLE, array( $this, 'blocks' ), array(), Capabilities::VIEW );
	}

	/**
	 * Current settings.
	 */
	public function show(): \WP_REST_Response {
		return rest_ensure_response( Settings::all() );
	}

	/**
	 * Saves settings.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public function update( \WP_REST_Request $request ): \WP_REST_Response {
		return rest_ensure_response( Settings::save( (array) $request->get_json_params() ) );
	}

	/**
	 * Registered block types that can appear in post content, with their rule.
	 */
	public function blocks(): \WP_REST_Response {
		$rules  = (array) Settings::get( 'blocks', array() );
		$skip   = array( 'core/missing', 'core/freeform', 'core/block', 'core/template-part', 'core/post-content', 'core/pattern' );
		$blocks = array();
		foreach ( \WP_Block_Type_Registry::get_instance()->get_all_registered() as $name => $type ) {
			if ( in_array( $name, $skip, true ) || 0 === strpos( $name, 'core/post-' ) || 0 === strpos( $name, 'core/query' ) ) {
				continue;
			}
			if ( ! empty( $type->parent ) && ! in_array( $name, array( 'core/list-item' ), true ) ) {
				continue;
			}
			$blocks[] = array(
				'name'     => $name,
				'title'    => $type->title ? $type->title : $name,
				'category' => (string) $type->category,
				'icon'     => is_string( $type->icon ) ? $type->icon : '',
				'core'     => 0 === strpos( $name, 'core/' ),
				'use'      => $rules[ $name ] ?? null,
			);
		}
		usort(
			$blocks,
			static function ( $a, $b ) {
				return array( null === $a['use'], ! $a['core'], $a['title'] ) <=> array( null === $b['use'], ! $b['core'], $b['title'] );
			}
		);
		return rest_ensure_response(
			array(
				'blocks'   => $blocks,
				'fallback' => Settings::get( 'block_fallback', 'text' ),
				'uses'     => Settings::BLOCK_USES,
			)
		);
	}
}
