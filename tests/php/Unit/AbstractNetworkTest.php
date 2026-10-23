<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use Brain\Monkey\Functions;
use SocialIntegrations\Networks\NetworkException;
use SocialIntegrations\Tests\FakeNetwork;
use SocialIntegrations\Tests\TestCase;

final class AbstractNetworkTest extends TestCase {

	public function test_fit_text_cuts_with_an_ellipsis(): void {
		$network = new FakeNetwork();

		$this->assertSame( 'short', $this->call( $network, 'fit_text', 'short' ) );
		$this->assertSame( str_repeat( 'é', 20 ), $this->call( $network, 'fit_text', str_repeat( 'é', 20 ) ) );
		$this->assertSame( str_repeat( 'é', 19 ) . '…', $this->call( $network, 'fit_text', str_repeat( 'é', 21 ) ) );
		$this->assertSame( 'one two…', $this->call( $network, 'fit_text', 'one two             three' ) );
	}

	public function test_image_urls_stop_at_max_images(): void {
		$urls = $this->call(
			new FakeNetwork(),
			'image_urls',
			array(
				'images' => array(
					array( 'url' => 'a.jpg' ),
					'not an array',
					array( 'url' => '' ),
					array( 'url' => 'b.jpg' ),
					array( 'url' => 'c.jpg' ),
				),
			)
		);

		$this->assertSame( array( 'a.jpg', 'b.jpg' ), $urls );
	}

	public function test_field_reads_the_payload_or_a_plain_default(): void {
		$network = new FakeNetwork();

		$this->assertSame( 'link', $this->call( $network, 'field', array( 'fields' => array( 'format' => 'link' ) ), 'format' ) );
		$this->assertSame( 'auto', $this->call( $network, 'field', array(), 'format' ) );
		$this->assertSame( '', $this->call( $network, 'field', array(), 'title' ), 'A token field has no default at share time.' );
		$this->assertSame( '', $this->call( $network, 'field', array(), 'unknown' ) );
	}

	public function test_post_field_finds_a_field_by_name(): void {
		$network = new FakeNetwork();

		$this->assertSame( 10, $network->post_field( 'title' )['max'] );
		$this->assertSame( 20, $network->post_field( 'first_comment' )['max'] );
		$this->assertNull( $network->post_field( 'nope' ) );
	}

	public function test_build_url_encodes_rfc3986(): void {
		$this->assertSame(
			'https://example.com/a?q=a%20b&x=%2F',
			$this->call( FakeNetwork::class, 'build_url', 'https://example.com/a', array( 'q' => 'a b', 'x' => '/' ) )
		);
	}

	public function test_with_expiry(): void {
		$network = new FakeNetwork();

		$with = $this->call( $network, 'with_expiry', array( 'token' => 't' ), array( 'expires_in' => 60 ) );
		$this->assertEqualsWithDelta( time() + 60, $with['expires_at'], 2 );
		$this->assertSame( array( 'token' => 't' ), $this->call( $network, 'with_expiry', array( 'token' => 't' ), array( 'expires_in' => 0 ) ) );
	}

	public function test_broker_key_only_for_oauth2(): void {
		$this->assertSame( 'fake', ( new FakeNetwork() )->broker_key() );
	}

	public function test_error_messages(): void {
		$network = new FakeNetwork();

		$this->assertSame( 'expired', $this->call( $network, 'error_code', 401, array() ) );
		$this->assertSame( 'http_403', $this->call( $network, 'error_code', 403, array() ) );
		$this->assertSame( 'Fake sign-in expired. Reconnect the account.', $this->call( $network, 'error_message', 401, array() ) );
		$this->assertSame( 'Fake did not accept the post. Too long', $this->call( $network, 'error_message', 400, array( 'error' => array( 'message' => 'Too long' ) ) ) );
		$this->assertSame( 'Fake did not accept the post. Nope', $this->call( $network, 'error_message', 400, array( 'message' => 'Nope' ) ) );
		$this->assertSame( 'Fake did not accept the post.', $this->call( $network, 'error_message', 500, array() ) );
	}

	public function test_request_decodes_json_and_keeps_a_trace(): void {
		$this->fake_http( 200, '{"id":"9","access_token":"t"}', array( 'x-id' => array( 'abc' ) ) );
		$network = new FakeNetwork();

		$body = $this->call( $network, 'request', 'POST', 'https://example.com/a?access_token=t' );

		$this->assertSame( '9', $body['id'] );
		$this->assertSame( 'abc', $this->call( $network, 'last_header', 'X-ID' ) );
		$trace = $network->take_trace();
		$this->assertCount( 1, $trace );
		$this->assertSame( 'POST', $trace[0]['method'] );
		$this->assertSame( 200, $trace[0]['status'] );
		$this->assertSame( 'https://example.com/a?access_token=[hidden]', $trace[0]['url'] );
		$this->assertSame( '[hidden]', $trace[0]['response']['access_token'] );
		$this->assertSame( array(), $network->take_trace(), 'take_trace() starts a new trace.' );
	}

	public function test_request_throws_a_human_error_on_401(): void {
		$this->fake_http( 401, '{"message":"bad token"}' );

		try {
			$this->call( new FakeNetwork(), 'request', 'GET', 'https://example.com' );
			$this->fail( 'No exception.' );
		} catch ( NetworkException $e ) {
			$this->assertTrue( $e->is_expired() );
			$this->assertSame( 401, $e->getCode() );
			$this->assertSame( 'Fake sign-in expired. Reconnect the account.', $e->getMessage() );
		}
	}

	public function test_comment_errors_name_the_comment(): void {
		$this->fake_http( 400, '{"message":"Closed"}' );
		$network = new class() extends FakeNetwork {
			public function comment( array $credentials, array $post, string $text ): array {
				$this->request( 'POST', 'https://example.com/comment' );
				return array();
			}
		};

		try {
			$network->add_comment( array(), array(), 'Hi' );
			$this->fail( 'No exception.' );
		} catch ( NetworkException $e ) {
			$this->assertSame( 'Fake did not accept the comment. Closed', $e->getMessage() );
		}
		$this->assertSame( 'Fake did not accept the post.', $this->call( $network, 'error_message', 400, array() ) );
	}

	public function test_request_throws_on_a_transport_error(): void {
		$error = \Mockery::mock( 'WP_Error' );
		$error->shouldReceive( 'get_error_code' )->andReturn( 'http_request_failed' );
		$error->shouldReceive( 'get_error_message' )->andReturn( 'Timed out' );
		Functions\when( 'wp_remote_request' )->justReturn( $error );
		Functions\when( 'is_wp_error' )->justReturn( true );
		$network = new FakeNetwork();

		try {
			$this->call( $network, 'request', 'GET', 'https://example.com' );
			$this->fail( 'No exception.' );
		} catch ( NetworkException $e ) {
			$this->assertSame( 'http', $e->error_code() );
			$this->assertSame( 'Timed out', $e->getMessage() );
		}
		$this->assertSame( 0, $network->take_trace()[0]['status'] );
	}

	/**
	 * Makes wp_remote_request() answer with a status and a body.
	 */
	private function fake_http( int $status, string $body, array $headers = array() ): void {
		Functions\when( 'wp_remote_request' )->justReturn( array( 'response' => array( 'code' => $status ) ) );
		Functions\when( 'is_wp_error' )->justReturn( false );
		Functions\when( 'wp_remote_retrieve_headers' )->justReturn( $headers );
		Functions\when( 'wp_remote_retrieve_response_code' )->justReturn( $status );
		Functions\when( 'wp_remote_retrieve_body' )->justReturn( $body );
	}
}
