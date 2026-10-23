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

	/** Fake answers of Telegram for a bot that can post in a channel. */
	private function telegram_accepts_the_bot(): void {
		$this->answers['https://api.telegram.org/bot123:abc/getMe']         = array( 200, array( 'ok' => true, 'result' => array( 'id' => 9, 'username' => 'shop_bot' ) ) );
		$this->answers['https://api.telegram.org/bot123:abc/getChatMember'] = array( 200, array( 'ok' => true, 'result' => array( 'status' => 'administrator', 'can_post_messages' => true ) ) );
		$this->answers['https://api.telegram.org/bot123:abc/getChat']       = array( 200, array( 'ok' => true, 'result' => array( 'id' => -1002, 'type' => 'channel', 'title' => 'Shop', 'username' => 'shop' ) ) );
	}

	public function test_connect_a_token_network(): void {
		$this->telegram_accepts_the_bot();

		$response = $this->rest( 'POST', '/accounts/telegram', array( 'bot_token' => ' 123:abc ', 'chat_id' => '@shop' ) );

		$this->assertSame( 200, $response->get_status(), wp_json_encode( $response->get_data() ) );
		$this->assertSame( 'telegram', $response->get_data()['id'] );
		$this->assertSame( 'Shop', $response->get_data()['name'] );
		$this->assertSame( '123:abc', Accounts::get( 'telegram' )['credentials']['bot_token'] );
	}

	public function test_credentials_are_encrypted_and_never_sent_to_the_browser(): void {
		$this->telegram();

		$stored = get_option( Accounts::OPTION );
		$this->assertStringNotContainsString( 'secret-token', serialize( $stored ) );

		$list = $this->rest( 'GET', '/accounts' )->get_data();
		$this->assertSame( 'telegram', $list[0]['id'] );
		$this->assertArrayNotHasKey( 'credentials', $list[0] );
		$this->assertStringNotContainsString( 'secret-token', wp_json_encode( $list ) );
	}

	public function test_connect_shows_a_human_error(): void {
		$this->answers['https://api.telegram.org/'] = array( 401, array( 'ok' => false, 'description' => 'Unauthorized' ) );

		$response = $this->rest( 'POST', '/accounts/telegram', array( 'bot_token' => '123:abc', 'chat_id' => '@shop' ) );

		$this->assertSame( 400, $response->get_status() );
		$this->assertSame( 'Telegram did not accept this bot token. Copy it again from @BotFather.', $response->get_data()['message'] );
		$this->assertSame( array(), Accounts::all() );
	}

	public function test_connect_refuses_a_bad_token_without_a_request(): void {
		$response = $this->rest( 'POST', '/accounts/telegram', array( 'bot_token' => 'nope', 'chat_id' => '@shop' ) );

		$this->assertSame( 400, $response->get_status() );
		$this->assertSame( array(), $this->requests );
	}

	public function test_connect_refuses_sign_in_networks_and_unknown_ones(): void {
		$this->assertSame( 'sint_use_sign_in', $this->rest( 'POST', '/accounts/facebook' )->get_data()['code'] );
		$this->assertSame( 404, $this->rest( 'POST', '/accounts/myspace' )->get_status() );
	}

	public function test_disconnect(): void {
		$id = $this->telegram();

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
		$this->assertSame( 404, $this->rest( 'POST', '/apps/telegram' )->get_status() );
	}

	public function test_networks_list_what_the_admin_app_needs(): void {
		$data = $this->rest( 'GET', '/networks' )->get_data();

		$this->assertNotEmpty( $data['redirect_uri'] );
		$methods = array_column( $data['networks'], 'methods', 'key' );
		$this->assertSame( array( 'broker', 'app' ), $methods['facebook'] );
		$this->assertSame( array( 'app' ), $methods['linkedin'] );
		$this->assertSame( array(), $methods['telegram'] );
		foreach ( $data['networks'] as $network ) {
			foreach ( array( 'key', 'label', 'color', 'auth_type', 'char_limit', 'max_images', 'post_fields', 'methods' ) as $key ) {
				$this->assertArrayHasKey( $key, $network, $network['key'] );
			}
		}
	}
}
