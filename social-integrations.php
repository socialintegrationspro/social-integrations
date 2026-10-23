<?php
/**
 * Plugin Name:       Social Integrations – AI Auto Post & Social Media Scheduler
 * Plugin URI:        https://socialintegrations.com
 * Description:       Share your WordPress content to social networks when you publish, with AI-written captions, a content calendar and a share log.
 * Version:           0.1.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            Social Integrations
 * Author URI:        https://socialintegrations.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       social-integrations
 * Domain Path:       /languages
 *
 * @package SocialIntegrations
 */

defined( 'ABSPATH' ) || exit;

define( 'SINT_VERSION', '0.1.0' );
define( 'SINT_DB_VERSION', '5' );
define( 'SINT_FILE', __FILE__ );
define( 'SINT_PATH', plugin_dir_path( __FILE__ ) );
define( 'SINT_URL', plugin_dir_url( __FILE__ ) );

if ( is_readable( SINT_PATH . 'vendor/autoload.php' ) ) {
	require_once SINT_PATH . 'vendor/autoload.php';
} else {
	spl_autoload_register(
		static function ( $class_name ) {
			$prefix = 'SocialIntegrations\\';
			if ( 0 !== strpos( $class_name, $prefix ) ) {
				return;
			}
			$file = SINT_PATH . 'backend/' . str_replace( '\\', '/', substr( $class_name, strlen( $prefix ) ) ) . '.php';
			if ( is_readable( $file ) ) {
				require_once $file;
			}
		}
	);
}

register_activation_hook( __FILE__, array( \SocialIntegrations\Activator::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( \SocialIntegrations\Deactivator::class, 'deactivate' ) );

add_action( 'plugins_loaded', array( \SocialIntegrations\Plugin::class, 'boot' ), 10 );
