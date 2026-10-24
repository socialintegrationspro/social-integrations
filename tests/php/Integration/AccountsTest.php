<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Integration;

use SocialIntegrations\Networks\Accounts;

// phpcs:ignoreFile

final class AccountsTest extends IntegrationTestCase {

	public function set_up(): void {
		parent::set_up();
		$this->login();
	}

	public function test_credentials_are_encrypted_and_never_sent_to_the_browser(): void {
		$this->facebook();

		$stored = get_option( Accounts::OPTION );
		$this->assertStringNotContainsString( 'secret-token', serialize( $stored ) );

		$list = $this->rest( 'GET', '/accounts' )->get_data();
		$this->assertSame( 'facebook', $list[0]['id'] );
		$this->assertArrayNotHasKey( 'credentials', $list[0] );
		$this->assertStringNotContainsString( 'secret-token', wp_json_encode( $list ) );
	}

	public function test_connect_refuses_sign_in_networks_and_unknown_ones(): void {
		$this->assertSame( 'sint_use_sign_in', $this->rest( 'POST', '/accounts/facebook' )->get_data()['code'] );
		$this->assertSame( 404, $this->rest( 'POST', '/accounts/myspace' )->get_status() );
	}

	public function test_disconnect(): void {
		$id = $this->facebook();

		$this->assertTrue( $this->rest( 'DELETE', "/accounts/$id" )->get_data()['deleted'] );
		$this->assertNull( Accounts::get( $id ) );
		$this->assertSame( 404, $this->rest( 'DELETE', "/accounts/$id" )->get_status() );
	}

	public function test_save_an_app_needs_every_field(): void {
		$this->assertSame( 'sint_missing_field', $this->rest( 'POST', '/apps/facebook', array( 'client_id' => 'id' ) )->get_data()['code'] );

		$networks = $this->rest( 'GET', '/networks' )->get_data()['networks'];
		$facebook = $networks[ array_search( 'facebook', array_column( $networks, 'key' ), true ) ];
		$fields   = array();
		foreach ( $facebook['app_fields'] as $field ) {
			$fields[ $field['name'] ] = 'value';
		}

		$this->assertTrue( $this->rest( 'POST', '/apps/facebook', $fields )->get_data()['app_configured'] );
		$this->assertTrue( Accounts::has_app( 'facebook' ) );
		$this->assertSame( 404, $this->rest( 'POST', '/apps/myspace' )->get_status() );
	}

	public function test_networks_list_what_the_admin_app_needs(): void {
		$data = $this->rest( 'GET', '/networks' )->get_data();

		$this->assertNotEmpty( $data['redirect_uri'] );
		$methods = array_column( $data['networks'], 'methods', 'key' );
		$this->assertSame( array( 'broker', 'app' ), $methods['facebook'] );
		$this->assertSame( array( 'app' ), $methods['linkedin'] );
		$this->assertSame( array( 'facebook', 'linkedin' ), array_keys( $methods ) );
		foreach ( $data['networks'] as $network ) {
			foreach ( array( 'key', 'label', 'color', 'auth_type', 'char_limit', 'max_images', 'post_fields', 'methods' ) as $key ) {
				$this->assertArrayHasKey( $key, $network, $network['key'] );
			}
		}
	}
}
