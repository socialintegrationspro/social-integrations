<?php
/**
 * Block editor panel.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Editor;

use SocialIntegrations\AI\Providers;
use SocialIntegrations\Admin\Menu;
use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Networks\Registry;
use SocialIntegrations\Support\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Loads the editor bundle (build/editor/) in the block editor of every shareable
 * post type. The bundle adds the Social Integrations sidebar and the "Social" control in
 * the block toolbar. It uses the React and the components that WordPress loads.
 */
final class SidebarPanel {

	const HANDLE = 'sint-editor';

	/**
	 * Network registry.
	 *
	 * @var Registry
	 */
	private $networks;

	/**
	 * Constructor.
	 *
	 * @param Registry $networks Network registry.
	 */
	public function __construct( Registry $networks ) {
		$this->networks = $networks;
	}

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
		$files = self::bundle();
		if ( '' === $files['js'] ) {
			return;
		}

		// The file time changes the URL between watch builds, which keep the same file names.
		$path = SINT_PATH . 'build/editor/';
		$url  = SINT_URL . 'build/editor/';
		$deps = array( 'wp-api-fetch', 'wp-block-editor', 'wp-components', 'wp-compose', 'wp-data', 'wp-edit-post', 'wp-editor', 'wp-element', 'wp-hooks', 'wp-i18n', 'wp-plugins' );
		wp_enqueue_script( self::HANDLE, $url . $files['js'], $deps, SINT_VERSION . '.' . filemtime( $path . $files['js'] ), true );
		if ( '' !== $files['css'] ) {
			wp_enqueue_style( self::HANDLE, $url . $files['css'], array( 'wp-components' ), SINT_VERSION . '.' . filemtime( $path . $files['css'] ) );
		}
		wp_set_script_translations( self::HANDLE, 'social-integrations', SINT_PATH . 'languages' );
		wp_add_inline_script( self::HANDLE, 'window.sintEditor = ' . wp_json_encode( $this->config() ) . ';', 'before' );
	}

	/**
	 * The script and the stylesheet of the bundle, as paths in build/editor/. A release build
	 * names them by their content; the names come from the Vite manifest.
	 *
	 * @return array{js: string, css: string} Empty for a file that is not there.
	 */
	private static function bundle(): array {
		$dir      = SINT_PATH . 'build/editor/';
		$files    = array(
			'js'  => '',
			'css' => '',
		);
		$manifest = is_readable( $dir . '.vite/manifest.json' ) ? json_decode( (string) file_get_contents( $dir . '.vite/manifest.json' ), true ) : null; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		foreach ( is_array( $manifest ) ? $manifest : array() as $chunk ) {
			$file = (string) ( $chunk['file'] ?? '' );
			$type = pathinfo( $file, PATHINFO_EXTENSION );
			if ( isset( $files[ $type ] ) && '' === $files[ $type ] && is_readable( $dir . $file ) ) {
				$files[ $type ] = $file;
			}
		}
		return $files;
	}

	/**
	 * Data for `window.sintEditor`. Holds no secrets.
	 */
	private function config(): array {
		$names  = array();
		$fields = array();
		foreach ( $this->networks->all() as $network ) {
			$names[ $network->key() ]  = $network->label();
			$fields[ $network->key() ] = $network->post_fields();
		}
		return array(
			'pageUrl'       => esc_url_raw( Menu::url() ),
			'networkNames'  => (object) $names,
			'postFields'    => (object) $fields,
			'blockOverride' => (bool) Settings::get( 'allow_block_override', true ),
			'blockRules'    => (object) Settings::get( 'blocks', array() ),
			'blockFallback' => (string) Settings::get( 'block_fallback', 'text' ),
			'aiReady'       => null !== Providers::current(),
			'tokens'        => $this->tokens(),
		);
	}

	/**
	 * The tokens of a caption for the post type on the screen, such as {price} for a product.
	 *
	 * @return string[]
	 */
	private function tokens(): array {
		$tokens = array( '{title}', '{excerpt}', '{url}', '{tags}', '{author}', '{site}' );
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		$type   = $screen && ! empty( $screen->post_type ) ? (string) $screen->post_type : '';
		$all    = PostTypes::all();
		foreach ( (array) ( $all[ $type ]['tokens'] ?? array() ) as $name ) {
			$tokens[] = '{' . $name . '}';
		}
		return $tokens;
	}
}
