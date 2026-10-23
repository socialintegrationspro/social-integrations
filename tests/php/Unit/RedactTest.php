<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use SocialIntegrations\Support\Redact;
use SocialIntegrations\Tests\TestCase;

final class RedactTest extends TestCase {

	const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-123';

	public function test_url_hides_secret_query_values(): void {
		$this->assertSame(
			'https://graph.example.com/me?fields=id,name&access_token=[hidden]',
			Redact::url( 'https://graph.example.com/me?fields=id,name&access_token=EAAB123' )
		);
		$this->assertSame(
			'https://x.example.com/a?client_secret=[hidden]&code_verifier=[hidden]',
			Redact::url( 'https://x.example.com/a?client_secret=s&code_verifier=v' )
		);
	}

	public function test_url_hides_a_telegram_bot_token(): void {
		$this->assertSame(
			'https://api.telegram.org/bot[hidden]/sendMessage',
			Redact::url( 'https://api.telegram.org/bot123456:ABC-def_789/sendMessage' )
		);
	}

	public function test_url_hides_a_webhook_token(): void {
		$this->assertSame(
			'https://chat.example.com/api/v10/webhooks/42/[hidden]',
			Redact::url( 'https://chat.example.com/api/v10/webhooks/42/tok-EN_value' )
		);
	}

	public function test_url_without_a_query_does_not_change(): void {
		$this->assertSame( 'https://example.com/a/b', Redact::url( 'https://example.com/a/b' ) );
	}

	public function test_data_hides_secrets_at_any_depth(): void {
		$clean = Redact::data(
			array(
				'id'      => '1',
				'session' => array( 'refreshJwt' => 'r' ),
				'auth'    => array(
					'accessToken' => 'a',
					'note'        => 'Bearer ' . self::JWT,
				),
				'list'    => array( array( 'api_key' => 'k' ) ),
				'count'   => 3,
			)
		);

		$this->assertSame( '1', $clean['id'] );
		$this->assertSame( '[hidden]', $clean['session']['refreshJwt'] );
		$this->assertSame( '[hidden]', $clean['auth']['accessToken'] );
		$this->assertSame( 'Bearer [hidden]', $clean['auth']['note'] );
		$this->assertSame( '[hidden]', $clean['list'][0]['api_key'] );
		$this->assertSame( 3, $clean['count'] );
	}

	public function test_data_keeps_scalars(): void {
		$this->assertSame( 'text', Redact::data( 'text' ) );
		$this->assertNull( Redact::data( null ) );
	}

	public function test_body_decodes_json_and_hides_secrets(): void {
		$this->assertSame(
			array(
				'error'        => 'bad',
				'access_token' => '[hidden]',
			),
			Redact::body( '{"error":"bad","access_token":"t"}' )
		);
	}

	public function test_body_cuts_long_json_to_text(): void {
		$body = Redact::body( json_encode( array( 'message' => str_repeat( 'a', 100 ) ) ), 20 );

		$this->assertIsString( $body );
		$this->assertSame( 20 + strlen( '…' ), strlen( $body ) );
	}

	public function test_body_keeps_the_text_of_an_html_page(): void {
		$this->assertSame(
			'Bad Gateway The server [hidden] failed.',
			Redact::body( "<html><body><h1>Bad Gateway</h1>\n<p>The server " . self::JWT . ' failed.</p></body></html>' )
		);
	}
}
