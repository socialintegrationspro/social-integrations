<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Integration;

// phpcs:ignoreFile

/**
 * Each route checks a capability of the plugin. Administrators have every capability;
 * other users and visitors get none.
 */
final class RestPermissionsTest extends IntegrationTestCase {

	/**
	 * Routes as [ method, path ].
	 */
	public function routes(): array {
		return array(
			'networks'        => array( 'GET', '/networks' ),
			'accounts'        => array( 'GET', '/accounts' ),
			'connect'         => array( 'POST', '/accounts/facebook' ),
			'disconnect'      => array( 'DELETE', '/accounts/facebook' ),
			'save app'        => array( 'POST', '/apps/facebook' ),
			'queue'           => array( 'GET', '/queue?from=2026-01-01&to=2026-02-01' ),
			'create share'    => array( 'POST', '/queue' ),
			'update share'    => array( 'POST', '/queue/1' ),
			'delete share'    => array( 'DELETE', '/queue/1' ),
			'retry share'     => array( 'POST', '/queue/1/retry' ),
			'logs'            => array( 'GET', '/logs' ),
			'delete logs'     => array( 'POST', '/logs/delete' ),
			'settings'        => array( 'GET', '/settings' ),
			'save settings'   => array( 'POST', '/settings' ),
			'campaigns'       => array( 'GET', '/campaigns' ),
			'dashboard'       => array( 'GET', '/dashboard' ),
			'post types'      => array( 'GET', '/post-types' ),
		);
	}

	/**
	 * @dataProvider routes
	 */
	public function test_visitors_get_401( string $method, string $path ): void {
		wp_set_current_user( 0 );

		$this->assertSame( 401, $this->rest( $method, $path )->get_status() );
	}

	/**
	 * @dataProvider routes
	 */
	public function test_editors_get_403( string $method, string $path ): void {
		$this->login( 'editor' );

		$this->assertSame( 403, $this->rest( $method, $path )->get_status() );
	}

	/**
	 * @dataProvider routes
	 */
	public function test_administrators_pass_the_check( string $method, string $path ): void {
		$this->login();

		$status = $this->rest( $method, $path )->get_status();

		$this->assertNotContains( $status, array( 401, 403 ), "$method $path" );
	}

	public function test_every_route_of_the_namespace_has_a_permission_check(): void {
		foreach ( rest_get_server()->get_routes( 'sint/v1' ) as $route => $handlers ) {
			// The index of the namespace belongs to WordPress.
			if ( '/sint/v1' === $route ) {
				continue;
			}
			foreach ( $handlers as $handler ) {
				if ( isset( $handler['methods'] ) ) {
					$this->assertIsCallable( $handler['permission_callback'] ?? null, $route );
				}
			}
		}
	}
}
