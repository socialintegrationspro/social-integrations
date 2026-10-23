<?php
/**
 * Admin page.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Admin;

defined( 'ABSPATH' ) || exit;

/**
 * Adds the menu item and the page the React app mounts on.
 */
final class Menu {

	const SLUG = 'social-integrations';

	/**
	 * Registers hooks.
	 */
	public function register(): void {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_filter( 'admin_body_class', array( $this, 'body_class' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( SINT_FILE ), array( $this, 'action_links' ) );
	}

	/**
	 * Adds the top-level menu item.
	 */
	public function add_menu(): void {
		$icon = 'data:image/svg+xml;base64,' . base64_encode( // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#a7aaad" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/></svg>'
		);
		add_menu_page(
			__( 'Social Integrations', 'social-integrations' ),
			__( 'Social Integrations', 'social-integrations' ),
			'manage_options',
			self::SLUG,
			array( $this, 'render' ),
			$icon,
			26
		);
	}

	/**
	 * Mount point for the admin app.
	 */
	public function render(): void {
		echo '<div id="sint-app" class="sint-root"><noscript>' . esc_html__( 'Social Integrations needs JavaScript.', 'social-integrations' ) . '</noscript></div>';
	}

	/**
	 * Marks the plugin page so its styles apply only there.
	 *
	 * @param string $classes Body classes.
	 */
	public function body_class( string $classes ): string {
		return self::is_plugin_page() ? $classes . ' sint-admin-page' : $classes;
	}

	/**
	 * URL of the plugin page, plus an optional app route such as '#/accounts'.
	 *
	 * @param string $fragment Text added after the page URL.
	 */
	public static function url( string $fragment = '' ): string {
		return admin_url( 'admin.php?page=' . self::SLUG . $fragment );
	}

	/**
	 * Adds an "Open" link on the Plugins screen.
	 *
	 * @param string[] $links Links.
	 */
	public function action_links( array $links ): array {
		array_unshift( $links, '<a href="' . esc_url( self::url() ) . '">' . esc_html__( 'Open', 'social-integrations' ) . '</a>' );
		return $links;
	}

	/**
	 * Whether the current screen is the plugin page.
	 */
	public static function is_plugin_page(): bool {
		return isset( $_GET['page'] ) && self::SLUG === $_GET['page']; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	}
}
