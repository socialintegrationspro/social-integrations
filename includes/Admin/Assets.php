<?php
/**
 * Admin app assets.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Admin;

use SocialIntegrations\Hooks;
use SocialIntegrations\Auth\OAuth;

defined( 'ABSPATH' ) || exit;

/**
 * Loads the built app from `build/` using the Vite manifest. When the constant
 * SINT_DEV_SERVER holds a URL (for example http://localhost:5174), loads the
 * app from that dev server instead.
 */
final class Assets {

	const HANDLE = 'sint-admin';
	const ENTRY  = 'src/admin/main.tsx';

	/**
	 * Registers hooks.
	 */
	public function register(): void {
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		add_filter( 'script_loader_tag', array( $this, 'module_tag' ), 10, 2 );
	}

	/**
	 * Enqueues the app on the plugin page only.
	 */
	public function enqueue(): void {
		if ( ! Menu::is_plugin_page() ) {
			return;
		}

		$deps = (array) apply_filters( Hooks::ADMIN_SCRIPT_DEPENDENCIES, array( 'wp-hooks', 'wp-i18n' ) );
		$dev  = defined( 'SINT_DEV_SERVER' ) ? untrailingslashit( (string) SINT_DEV_SERVER ) : '';

		if ( $dev ) {
			// React Fast Refresh expects this preamble before the app module loads.
			add_action(
				'admin_print_scripts',
				static function () use ( $dev ) {
					printf(
						'<script type="module">import RefreshRuntime from "%s/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script>',
						esc_url( $dev )
					);
				}
			);
			wp_enqueue_script( 'sint-vite-client', $dev . '/@vite/client', array(), null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
			wp_enqueue_script( self::HANDLE, $dev . '/' . self::ENTRY, $deps, null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
		} else {
			$entry = $this->manifest_entry();
			if ( ! $entry ) {
				add_action( 'admin_notices', array( $this, 'missing_build_notice' ) );
				return;
			}
			wp_enqueue_script( self::HANDLE, SINT_URL . 'build/' . $entry['file'], $deps, SINT_VERSION, true );
			foreach ( (array) ( $entry['css'] ?? array() ) as $i => $css ) {
				wp_enqueue_style( self::HANDLE . '-' . $i, SINT_URL . 'build/' . $css, array(), SINT_VERSION );
			}
		}

		wp_add_inline_script( self::HANDLE, 'window.sintConfig = ' . wp_json_encode( $this->config() ) . ';', 'before' );
		wp_set_script_translations( self::HANDLE, 'social-integrations', SINT_PATH . 'languages' );
	}

	/**
	 * Loads the app scripts as ES modules.
	 *
	 * @param string $tag    Script tag.
	 * @param string $handle Handle.
	 */
	public function module_tag( string $tag, string $handle ): string {
		if ( in_array( $handle, array( self::HANDLE, 'sint-vite-client' ), true ) && false === strpos( $tag, 'type="module"' ) ) {
			$tag = str_replace( '<script ', '<script type="module" ', $tag );
		}
		return $tag;
	}

	/**
	 * Shown when `build/` is missing.
	 */
	public function missing_build_notice(): void {
		echo '<div class="notice notice-error"><p>' . esc_html__( 'Social Integrations cannot find its built files. Run the build, then reload this page.', 'social-integrations' ) . '</p></div>';
	}

	/**
	 * Data for `window.sintConfig`.
	 */
	private function config(): array {
		$user = wp_get_current_user();
		return apply_filters(
			Hooks::ADMIN_CONFIG,
			array(
				'restUrl'     => esc_url_raw( rest_url( 'sint/v1/' ) ),
				'wpRestUrl'   => esc_url_raw( rest_url( 'wp/v2/' ) ),
				'nonce'       => wp_create_nonce( 'wp_rest' ),
				'adminUrl'    => esc_url_raw( admin_url() ),
				'pageUrl'     => esc_url_raw( admin_url( 'admin.php?page=' . Menu::SLUG ) ),
				'version'     => SINT_VERSION,
				'siteName'    => get_bloginfo( 'name' ),
				'timezone'    => wp_timezone_string(),
				'gmtOffset'   => (float) get_option( 'gmt_offset' ),
				'weekStart'   => (int) get_option( 'start_of_week', 1 ),
				'redirectUri' => OAuth::redirect_uri(),
				'user'        => array(
					'name'   => $user->display_name,
					'avatar' => get_avatar_url( $user->ID, array( 'size' => 64 ) ),
				),
			)
		);
	}

	/**
	 * The entry chunk from `build/.vite/manifest.json`.
	 */
	private function manifest_entry(): ?array {
		$file = SINT_PATH . 'build/.vite/manifest.json';
		if ( ! is_readable( $file ) ) {
			return null;
		}
		$manifest = json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		return is_array( $manifest ) && isset( $manifest[ self::ENTRY ] ) ? $manifest[ self::ENTRY ] : null;
	}
}
