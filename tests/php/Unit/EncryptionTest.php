<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use Brain\Monkey\Functions;
use SocialIntegrations\Support\Encryption;
use SocialIntegrations\Tests\TestCase;

final class EncryptionTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Functions\when( 'wp_salt' )->alias(
			static function ( $scheme ) {
				return 'salt-' . $scheme;
			}
		);
	}

	public function test_round_trip(): void {
		$stored = Encryption::encrypt( 'secret-token' );

		$this->assertStringStartsWith( Encryption::PREFIX, $stored );
		$this->assertStringNotContainsString( 'secret-token', $stored );
		$this->assertSame( 'secret-token', Encryption::decrypt( $stored ) );
	}

	public function test_each_encryption_uses_a_new_nonce(): void {
		$this->assertNotSame( Encryption::encrypt( 'a' ), Encryption::encrypt( 'a' ) );
	}

	public function test_empty_text_stays_empty(): void {
		$this->assertSame( '', Encryption::encrypt( '' ) );
		$this->assertSame( '', Encryption::decrypt( '' ) );
	}

	public function test_decrypt_refuses_bad_values(): void {
		$this->assertSame( '', Encryption::decrypt( 'plain text' ) );
		$this->assertSame( '', Encryption::decrypt( Encryption::PREFIX . '!!!' ) );
		$this->assertSame( '', Encryption::decrypt( Encryption::PREFIX . base64_encode( 'short' ) ) );

		$stored   = Encryption::encrypt( 'secret' );
		$tampered = substr( $stored, 0, -2 ) . ( 'AA' === substr( $stored, -2 ) ? 'BB' : 'AA' );
		$this->assertSame( '', Encryption::decrypt( $tampered ) );
	}

	public function test_other_salts_cannot_decrypt(): void {
		$stored = Encryption::encrypt( 'secret' );
		Functions\when( 'wp_salt' )->justReturn( 'other' );

		$this->assertSame( '', Encryption::decrypt( $stored ) );
	}

	public function test_arrays_encrypt_only_strings(): void {
		$stored = Encryption::encrypt_array(
			array(
				'token'      => 'abc',
				'expires_at' => 123,
			)
		);

		$this->assertSame( 123, $stored['expires_at'] );
		$this->assertNotSame( 'abc', $stored['token'] );
		$this->assertSame(
			array(
				'token'      => 'abc',
				'expires_at' => 123,
			),
			Encryption::decrypt_array( $stored )
		);
	}
}
