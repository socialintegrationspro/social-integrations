<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use SocialIntegrations\Networks\NetworkException;
use SocialIntegrations\Support\Dates;
use SocialIntegrations\Support\Errors;
use SocialIntegrations\Tests\TestCase;

final class SmallHelpersTest extends TestCase {

	public function test_iso_date_from_utc_mysql_date(): void {
		$this->assertSame( '2026-10-24T08:30:00+00:00', Dates::iso( '2026-10-24 08:30:00' ) );
		$this->assertSame( '', Dates::iso( 'not a date' ) );
	}

	public function test_error_text_is_plain(): void {
		$this->assertSame( 'Tom & "Jerry"', Errors::text( new \RuntimeException( 'Tom &amp; &quot;Jerry&quot;' ) ) );
	}

	public function test_network_exception_knows_an_expired_sign_in(): void {
		$expired = new NetworkException( 'expired', 'Sign-in expired.', 401 );
		$other   = new NetworkException( 'http_500', 'Failed.', 500 );

		$this->assertTrue( $expired->is_expired() );
		$this->assertSame( 401, $expired->getCode() );
		$this->assertFalse( $other->is_expired() );
		$this->assertSame( 'http_500', $other->error_code() );
	}
}
