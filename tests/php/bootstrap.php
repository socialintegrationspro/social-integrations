<?php
/**
 * Bootstrap for the unit tests. The tests run without WordPress: Brain Monkey mocks the
 * WordPress functions that a test reads, and this file defines the pure helpers.
 *
 * @package SocialIntegrations
 */

require dirname( __DIR__, 2 ) . '/vendor/autoload.php';

define( 'ABSPATH', __DIR__ . '/' );
define( 'MB_IN_BYTES', 1024 * 1024 );

require __DIR__ . '/stubs.php';

spl_autoload_register(
	static function ( $class_name ) {
		$prefix = 'SocialIntegrations\\Tests\\';
		if ( 0 === strpos( $class_name, $prefix ) ) {
			$file = __DIR__ . '/' . str_replace( '\\', '/', substr( $class_name, strlen( $prefix ) ) ) . '.php';
			if ( is_file( $file ) ) {
				require $file;
			}
		}
	}
);
