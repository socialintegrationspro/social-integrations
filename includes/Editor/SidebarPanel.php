<?php
/**
 * Block editor panel.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Editor;

use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Support\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Loads the editor bundle (build/editor/editor.js) in the block editor of every shareable
 * post type. The bundle adds the Social Integrations sidebar and the "Social" control in
 * the block toolbar. It uses the React and the components that WordPress loads.
 */
final class SidebarPanel {

	const HANDLE = 'sint-editor';

	/**
	 * Registers hooks.
	 */
	public function register(): void {
		add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue' ) );
	}

	/**
	 * Enqueues the bundle in the post editor, not in the site editor.
	 */
	public function enqueue(): void {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || 'post' !== $screen->base || ! in_array( $screen->post_type, PostTypes::names(), true ) ) {
			return;
		}
		$script = SINT_PATH . 'build/editor/editor.js';
		if ( ! is_readable( $script ) ) {
			return;
		}

		$deps = array( 'wp-api-fetch', 'wp-block-editor', 'wp-components', 'wp-compose', 'wp-data', 'wp-edit-post', 'wp-editor', 'wp-element', 'wp-hooks', 'wp-i18n', 'wp-plugins' );
		wp_enqueue_script( self::HANDLE, SINT_URL . 'build/editor/editor.js', $deps, SINT_VERSION . '.' . filemtime( $script ), true );
		if ( is_readable( SINT_PATH . 'build/editor/editor.css' ) ) {
			wp_enqueue_style( self::HANDLE, SINT_URL . 'build/editor/editor.css', array( 'wp-components' ), SINT_VERSION . '.' . filemtime( SINT_PATH . 'build/editor/editor.css' ) );
		}
		wp_set_script_translations( self::HANDLE, 'social-integrations', SINT_PATH . 'languages' );
		wp_add_inline_script( self::HANDLE, 'window.sintEditor = ' . wp_json_encode( $this->config() ) . ';', 'before' );
	}

	/**
	 * Data for `window.sintEditor`. Holds no secrets.
	 */
	private function config(): array {
		return array(
			'canManage'     => current_user_can( 'manage_options' ),
			'pageUrl'       => esc_url_raw( admin_url( 'admin.php?page=social-integrations' ) ),
			'blockOverride' => (bool) Settings::get( 'allow_block_override', true ),
			'blockRules'    => (object) Settings::get( 'blocks', array() ),
			'blockFallback' => (string) Settings::get( 'block_fallback', 'text' ),
		);
	}
}
