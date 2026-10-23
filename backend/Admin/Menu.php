<?php
/**
 * Admin page.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Admin;

defined( 'ABSPATH' ) || exit;

use SocialIntegrations\Support\Capabilities;


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
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#a7aaad" d="M6 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM18 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM18 14.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM7.8 9.9l8.4-4 .85 1.8-8.4 4zM7.8 14.1l.85-1.8 8.4 4-.85 1.8z"/></svg>'
		);
		add_menu_page(
			__( 'Social Integrations', 'social-integrations' ),
			__( 'Social Integrations', 'social-integrations' ),
			Capabilities::VIEW,
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
