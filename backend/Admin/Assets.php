<?php
/**
 * Admin app assets.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Admin;

use SocialIntegrations\AI\Providers;
use SocialIntegrations\Hooks;
use SocialIntegrations\Auth\OAuth;
use SocialIntegrations\Support\Capabilities;

defined( 'ABSPATH' ) || exit;

/**
 * Loads the built app from `build/` using the Vite manifest. When the constant
 * SINT_DEV_SERVER holds a URL (for example http://localhost:5174), loads the
 * app from that dev server instead.
 */
final class Assets {

	const HANDLE = 'sint-admin';
	const ENTRY  = 'frontend/admin/main.tsx';

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
		// The Vite dev server is for local development only. On any other site the plugin
		// loads only its own build/ files.
		$local = in_array( wp_get_environment_type(), array( 'local', 'development' ), true );
		$dev   = $local && defined( 'SINT_DEV_SERVER' ) ? untrailingslashit( (string) SINT_DEV_SERVER ) : '';

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
			$this->preload( $entry );
			foreach ( (array) ( $entry['css'] ?? array() ) as $i => $css ) {
				wp_enqueue_style( self::HANDLE . '-' . $i, SINT_URL . 'build/' . $css, array(), SINT_VERSION );
			}
		}

		// The composer adds images from the media library.
		wp_enqueue_media();

		wp_add_inline_script( self::HANDLE, 'window.sintConfig = ' . wp_json_encode( $this->config() ) . ';', 'before' );
		wp_set_script_translations( self::HANDLE, 'social-integrations', SINT_PATH . 'languages' );
	}

	/**
	 * Starts the download of the entry and its imported chunks in the head. Without it, the
	 * browser finds an imported chunk only after the entry, at the end of the page, runs.
	 *
	 * @param array $entry The entry chunk from the manifest.
	 */
	private function preload( array $entry ): void {
		// The entry has the version in its URL. An import must have the URL that the entry imports.
		$urls     = array( add_query_arg( 'ver', SINT_VERSION, SINT_URL . 'build/' . $entry['file'] ) );
		$manifest = $this->manifest();
		foreach ( (array) ( $entry['imports'] ?? array() ) as $import ) {
			if ( isset( $manifest[ $import ]['file'] ) ) {
				$urls[] = SINT_URL . 'build/' . $manifest[ $import ]['file'];
			}
		}
		add_action(
			'admin_head',
			static function () use ( $urls ) {
				foreach ( $urls as $url ) {
					printf( '<link rel="modulepreload" href="%s" />' . "\n", esc_url( $url ) );
				}
			}
		);
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
		echo '<div class="notice notice-error"><p>' . esc_html__( 'Social Integrations cannot find its built files. Run the build. Then reload this page.', 'social-integrations' ) . '</p></div>';
	}

	/**
	 * Data for `window.sintConfig`.
	 */
	private function config(): array {
		return apply_filters(
			Hooks::ADMIN_CONFIG,
			array(
				'restUrl'     => esc_url_raw( rest_url( 'sint/v1/' ) ),
				'nonce'       => wp_create_nonce( 'wp_rest' ),
				'pageUrl'     => esc_url_raw( Menu::url() ),
				'timezone'    => wp_timezone_string(),
				'gmtOffset'   => (float) get_option( 'gmt_offset' ),
				'weekStart'   => (int) get_option( 'start_of_week', 1 ),
				'redirectUri' => OAuth::redirect_uri(),
				'oauthError'  => OAuth::take_error(),
				'ai'          => array( 'ready' => null !== Providers::current() ),
				'user'        => array(
					'name' => wp_get_current_user()->display_name,
					'caps' => $this->caps(),
				),
				'store'       => $this->store(),
			)
		);
	}

	/**
	 * The plugin's capabilities that the current user has, so the app shows only the screens and
	 * controls that the user can use.
	 *
	 * @return array<string, bool>
	 */
	private function caps(): array {
		$caps = array();
		foreach ( Capabilities::ALL as $cap ) {
			$caps[ $cap ] = current_user_can( $cap );
		}
		return $caps;
	}

	/**
	 * The networks, accounts and post types, as the REST routes give them. They are in the page,
	 * so the app shows them without three more requests.
	 */
	private function store(): array {
		$store = array();
		foreach ( array( 'networks', 'accounts', 'post-types' ) as $route ) {
			$response        = rest_do_request( new \WP_REST_Request( 'GET', '/sint/v1/' . $route ) );
			$store[ $route ] = $response->is_error() ? null : rest_get_server()->response_to_data( $response, false );
		}
		return $store;
	}

	/**
	 * The entry chunk from `build/.vite/manifest.json`.
	 */
	private function manifest_entry(): ?array {
		$manifest = $this->manifest();
		return isset( $manifest[ self::ENTRY ] ) ? $manifest[ self::ENTRY ] : null;
	}

	/**
	 * The chunks in `build/.vite/manifest.json`, read once.
	 */
	private function manifest(): array {
		static $manifest = null;
		if ( null === $manifest ) {
			$file     = SINT_PATH . 'build/.vite/manifest.json';
			$manifest = is_readable( $file ) ? json_decode( (string) file_get_contents( $file ), true ) : array(); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$manifest = is_array( $manifest ) ? $manifest : array();
		}
		return $manifest;
	}
}
