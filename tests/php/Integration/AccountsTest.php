<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Integration;

use SocialIntegrations\Campaigns\Auto;
use SocialIntegrations\Campaigns\Campaigns;
use SocialIntegrations\Hooks;
use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Scheduler\Queue;

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

	public function test_disconnect_stops_unsent_shares_and_keeps_sent_ones(): void {
		$id        = $this->facebook();
		$scheduled = $this->share( $id, 'scheduled' );
		$draft     = $this->share( $id, 'draft' );
		$sent      = $this->share( $id, 'published' );

		$this->assertSame( array( 'campaigns' => 0, 'shares' => 2 ), $this->rest( 'GET', "/accounts/$id/impact" )->get_data() );
		$data = $this->rest( 'DELETE', "/accounts/$id" )->get_data();

		$this->assertSame( 2, $data['shares'] );
		$this->assertSame( 'failed', Queue::find( $scheduled )['status'] );
		$this->assertNull( Queue::find( $draft ) );
		$this->assertSame( 'published', Queue::find( $sent )['status'] );
		$log = Queue::last_logs( array( $scheduled ) )[ $scheduled ] ?? null;
		$this->assertNotNull( $log );
		$this->assertStringContainsString( 'The account was disconnected.', $log['message'] );
	}

	public function test_disconnect_removes_the_account_from_campaigns(): void {
		$id    = $this->facebook();
		$other = Accounts::save( 'linkedin', array( 'remote_id' => 'li-1', 'name' => 'Ann' ), array( 'access_token' => 't' ) )['id'];
		$only  = Auto::save( array( 'name' => 'Only', 'accounts' => array( $id ) ) )['id'];
		$both  = Auto::save( array( 'name' => 'Both', 'accounts' => array( $id, $other ) ) )['id'];
		$every = Auto::save( array( 'name' => 'Every', 'accounts' => array() ) )['id'];
		$fired = array();
		add_action(
			Hooks::ACCOUNT_DELETED,
			static function ( $account_id, $account ) use ( &$fired ) {
				$fired[] = array( $account_id, isset( $account['credentials'] ) );
			},
			10,
			2
		);

		$this->assertSame( 2, $this->rest( 'GET', "/accounts/$id/impact" )->get_data()['campaigns'] );
		$this->assertSame( 2, $this->rest( 'DELETE', "/accounts/$id" )->get_data()['campaigns'] );

		$this->assertSame( array( array( $id, false ) ), $fired );
		$this->assertSame( array( $other ), Campaigns::get( $both )['accounts'] );
		$this->assertTrue( Campaigns::get( $both )['active'] );
		// The last account left: the campaign stops and does not become "every account".
		$this->assertSame( array(), Campaigns::get( $only )['accounts'] );
		$this->assertTrue( Campaigns::get( $only )['no_accounts'] );
		$this->assertFalse( Campaigns::get( $only )['active'] );
		$this->assertTrue( Campaigns::get( $every )['active'] );
		$this->assertArrayNotHasKey( 'no_accounts', Campaigns::get( $every ) );

		$resume = $this->rest( 'POST', "/campaigns/$only/active", array( 'active' => true ) );
		$this->assertSame( 409, $resume->get_status() );
		$this->assertSame( 'sint_no_accounts', $resume->get_data()['code'] );
		$items = array_column( $this->rest( 'GET', '/campaigns' )->get_data(), null, 'id' );
		$this->assertTrue( $items[ $only ]['no_accounts'] );
		$this->assertFalse( $items[ $every ]['no_accounts'] );

		// A save without accounts needs a choice. A save with an account clears the mark.
		$this->assertSame( 400, $this->rest( 'POST', "/campaigns/auto/$only", array( 'name' => 'Only', 'accounts' => array(), 'no_accounts' => true ) )->get_status() );
		$this->rest( 'POST', "/campaigns/auto/$only", array( 'name' => 'Only', 'accounts' => array( $other ), 'active' => true ) );
		$this->assertArrayNotHasKey( 'no_accounts', Campaigns::get( $only ) );
		$this->assertTrue( Campaigns::get( $only )['active'] );
	}

	public function test_impact_of_an_unknown_account(): void {
		$this->assertSame( 404, $this->rest( 'GET', '/accounts/nothing/impact' )->get_status() );
	}

	/**
	 * Adds a share of an account with a status.
	 */
	private function share( string $account_id, string $status ): int {
		return Queue::add(
			array(
				'network'      => 'facebook',
				'account_id'   => $account_id,
				'caption'      => 'Hello',
				'status'       => $status,
				'scheduled_at' => gmdate( 'Y-m-d H:i:s', time() + HOUR_IN_SECONDS ),
			)
		);
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
		$this->assertSame( array( 'broker', 'app' ), $methods['linkedin'] );
		$this->assertEmpty( array_filter( $this->requests, static fn( $r ) => false !== strpos( $r['url'], 'socialintegrations.com' ) ) );
		$this->assertSame( array( 'facebook', 'linkedin' ), array_keys( $methods ) );
		foreach ( $data['networks'] as $network ) {
			foreach ( array( 'key', 'label', 'color', 'auth_type', 'char_limit', 'max_images', 'post_fields', 'methods' ) as $key ) {
				$this->assertArrayHasKey( $key, $network, $network['key'] );
			}
		}
	}
}
