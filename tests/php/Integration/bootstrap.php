<?php
/**
 * Bootstrap for the integration tests. They run in a real WordPress, in the Docker
 * `wordpress` container: `pnpm test:integration` at the repository root.
 *
 * @package SocialIntegrations
 */

// phpcs:ignoreFile

$root = dirname( __DIR__, 3 );

putenv( 'WP_PHPUNIT__TESTS_CONFIG=' . __DIR__ . '/wp-tests-config.php' );
require $root . '/vendor/autoload.php';

$tests_dir = getenv( 'WP_PHPUNIT__DIR' );
if ( ! $tests_dir || ! is_file( $tests_dir . '/includes/functions.php' ) ) {
	fwrite( STDERR, "Run `composer install` first: wp-phpunit is missing.\n" );
	exit( 1 );
}

require $tests_dir . '/includes/functions.php';

// Load the plugin before WordPress fires `plugins_loaded`. Other plugins, such as an
// add-on, can name more plugin files in SINT_TEST_PLUGINS (separated by commas).
tests_add_filter(
	'muplugins_loaded',
	static function () use ( $root ) {
		require $root . '/social-integrations.php';
		foreach ( array_filter( explode( ',', (string) getenv( 'SINT_TEST_PLUGINS' ) ) ) as $file ) {
			require $file;
		}
	}
);

// The tables, the rewrite rule and the default settings, as on activation. The rewrite
// object exists from `init`.
tests_add_filter(
	'init',
	static function () {
		\SocialIntegrations\Activator::activate();
	},
	0
);

require $tests_dir . '/includes/bootstrap.php';

require __DIR__ . '/IntegrationTestCase.php';
foreach ( array_filter( explode( ',', (string) getenv( 'SINT_TEST_CASES' ) ) ) as $file ) {
	require $file;
}
