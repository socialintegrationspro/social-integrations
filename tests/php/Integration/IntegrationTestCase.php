<?php
/**
 * Base class for the integration tests.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Integration;

use SocialIntegrations\Networks\Accounts;

// phpcs:ignoreFile

/**
 * Gives a fake network API, REST requests as a user, and a connected Facebook Page.
 */
abstract class IntegrationTestCase extends \WP_UnitTestCase {

	/**
	 * Requests that the fake network API received: [ 'method', 'url', 'body' ].
	 *
	 * @var array[]
	 */
	protected $requests = array();

	/**
	 * Answers by the start of a URL: url prefix => [ status, body array ] or a callable.
	 *
	 * @var array<string, array|callable>
	 */
	protected $answers = array();

	public function set_up(): void {
		parent::set_up();
		$this->requests = array();
		// The Social Integrations app signs in to Facebook.
		$this->answers = array(
			'https://app.socialintegrations.com/v1/networks' => array(
				200,
				array( 'networks' => array( array( 'key' => 'facebook' ) ) ),
			),
		);
		add_filter( 'pre_http_request', array( $this, 'fake_http' ), 10, 3 );
		_get_cron_array() && _set_cron_array( array() );
	}

	public function tear_down(): void {
		remove_filter( 'pre_http_request', array( $this, 'fake_http' ), 10 );
		parent::tear_down();
	}

	/**
	 * Filter callback: answers network requests. A request without an answer fails the test,
	 * so no test sends data to a real network.
	 *
	 * @param mixed  $pre  Earlier answer.
	 * @param array  $args Request arguments.
	 * @param string $url  URL.
	 * @return array
	 */
	public function fake_http( $pre, $args, $url ) {
		$this->requests[] = array(
			'method' => $args['method'] ?? 'GET',
			'url'    => $url,
			'body'   => $args['body'] ?? null,
		);
		foreach ( $this->answers as $prefix => $answer ) {
			if ( 0 === strpos( $url, $prefix ) ) {
				if ( is_callable( $answer ) ) {
					$answer = $answer( $url, $args );
				}
				return array(
					'headers'  => array(),
					'body'     => wp_json_encode( $answer[1] ),
					'response' => array(
						'code'    => $answer[0],
						'message' => '',
					),
					'cookies'  => array(),
					'filename' => null,
				);
			}
		}
		$this->fail( 'A request went to a URL without a fake answer: ' . $url );
	}

	/**
	 * Makes a user with a role the current user.
	 *
	 * @param string $role WordPress role.
	 */
	protected function login( string $role = 'administrator' ): int {
		$id = self::factory()->user->create( array( 'role' => $role ) );
		wp_set_current_user( $id );
		return $id;
	}

	/**
	 * Sends a REST request to the plugin's routes.
	 *
	 * @param string $method HTTP method.
	 * @param string $path   Path after /sint/v1, such as '/queue'.
	 * @param array  $body   JSON body (POST) or query (GET).
	 */
	protected function rest( string $method, string $path, array $body = array(), string $namespace = '/sint/v1' ): \WP_REST_Response {
		$parts   = explode( '?', $path, 2 );
		$request = new \WP_REST_Request( $method, $namespace . $parts[0] );
		if ( isset( $parts[1] ) ) {
			parse_str( $parts[1], $query );
			$request->set_query_params( $query );
		}
		if ( 'GET' === $method ) {
			$request->set_query_params( $body + $request->get_query_params() );
		} elseif ( $body ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( $body ) );
		}
		return rest_get_server()->dispatch( $request );
	}

	/**
	 * A connected Facebook Page, and fake Graph answers that accept each post.
	 *
	 * @return string Account ID.
	 */
	protected function facebook(): string {
		$account = Accounts::save(
			'facebook',
			array(
				'remote_id' => '1001',
				'name'      => 'Shop news',
			),
			array(
				'page_id'      => '1001',
				'access_token' => 'secret-token',
			)
		);
		$this->answers['https://graph.facebook.com/'] = array( 200, array( 'id' => '1001_42' ) );
		return $account['id'];
	}

	/**
	 * Makes Facebook refuse each post with a status, a message and a Graph error code.
	 */
	protected function facebook_refuses( int $status, string $message, int $code = 100 ): void {
		$this->answers['https://graph.facebook.com/'] = array(
			$status,
			array(
				'error' => array(
					'message' => $message,
					'code'    => $code,
				),
			),
		);
	}

	/**
	 * Requests to the fake API whose URL contains a text.
	 */
	protected function requests_to( string $text ): array {
		return array_values(
			array_filter(
				$this->requests,
				static function ( $r ) use ( $text ) {
					return false !== strpos( $r['url'], $text );
				}
			)
		);
	}
}
