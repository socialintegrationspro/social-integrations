<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Integration;

use SocialIntegrations\Hooks;
use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Scheduler\Publisher;
use SocialIntegrations\Scheduler\Queue;

// phpcs:ignoreFile

/**
 * The composer makes a campaign, the queue sends its shares, and the share log keeps the result.
 */
final class ShareFlowTest extends IntegrationTestCase {

	/** @var string */
	private $account;

	public function set_up(): void {
		parent::set_up();
		$this->login();
		$this->account = $this->facebook();
	}

	private function share( array $body = array() ): array {
		$response = $this->rest(
			'POST',
			'/queue',
			$body + array(
				'caption'  => 'Hello from the shop',
				'accounts' => array( $this->account ),
				'link'     => 'https://example.org/sale',
			)
		);
		$this->assertSame( 200, $response->get_status(), wp_json_encode( $response->get_data() ) );
		return $response->get_data();
	}

	public function test_share_now_publishes_and_logs(): void {
		$data = $this->share();

		$this->assertSame( 'published', $data['results'][0]['status'] );
		$this->assertSame( 'https://www.facebook.com/1001_42', $data['results'][0]['remote_url'] );
		$this->assertSame( 'published', Queue::find( $data['created'][0] )['status'] );

		$sent = $this->requests_to( '/1001/feed' );
		$this->assertCount( 1, $sent );
		$this->assertSame( 'Hello from the shop', $sent[0]['body']['message'] );
		$this->assertSame( 'https://example.org/sale', $sent[0]['body']['link'] );

		$log = $this->rest( 'GET', '/logs' )->get_data();
		$this->assertSame( 1, $log['total'] );
		$this->assertSame( 0, $log['failed'] );
		$this->assertSame( 'published', $log['items'][0]['shares'][0]['status'] );
	}

	public function test_log_details_hide_the_access_token(): void {
		$data  = $this->share();
		$log   = $this->rest( 'GET', '/logs' )->get_data();
		$tries = $this->rest( 'GET', '/logs/' . $log['items'][0]['shares'][0]['id'] . '/tries' )->get_data();

		$this->assertNotEmpty( $data['created'] );
		$this->assertNotEmpty( $tries );
		$this->assertStringNotContainsString( 'secret-token', wp_json_encode( $tries ) );
	}

	public function test_a_refused_share_fails_with_the_reason(): void {
		$this->facebook_refuses( 400, 'The Page was not found.' );

		$data = $this->share();

		$this->assertSame( 'failed', $data['results'][0]['status'] );
		$this->assertStringContainsString( 'The Page was not found.', $data['results'][0]['message'] );
		$this->assertSame( 1, $this->rest( 'GET', '/logs' )->get_data()['failed'] );
		$this->assertSame( 'connected', Accounts::get( $this->account )['status'] );
	}

	public function test_an_expired_sign_in_marks_the_account(): void {
		$this->facebook_refuses( 400, 'Error validating access token.', 190 );

		$data = $this->share();

		$this->assertSame( 'failed', $data['results'][0]['status'] );
		$this->assertSame( 'expired', Accounts::get( $this->account )['status'] );

		// The next share stops before it calls Facebook, with a clear message.
		$this->requests = array();
		$next           = $this->share();
		$this->assertSame( 'Facebook Page sign-in expired. Reconnect the account.', $next['results'][0]['message'] );
		$this->assertSame( array(), $this->requests_to( '/feed' ) );
	}

	public function test_retry_sends_a_failed_share_again(): void {
		$this->facebook_refuses( 400, 'Too many calls.', 4 );
		$id = $this->share()['created'][0];
		$this->facebook();

		$retry = $this->rest( 'POST', "/queue/$id/retry" );

		$this->assertSame( 200, $retry->get_status() );
		$this->assertSame( 'published', $retry->get_data()['status'] );
		$this->assertSame( 409, $this->rest( 'POST', "/queue/$id/retry" )->get_status(), 'A sent share cannot go again.' );
	}

	public function test_a_sent_share_cannot_change(): void {
		$id = $this->share()['created'][0];

		$response = $this->rest( 'POST', "/queue/$id", array( 'caption' => 'New' ) );

		$this->assertSame( 409, $response->get_status() );
		$this->assertSame( 'sint_sent', $response->get_data()['code'] );
	}

	public function test_a_later_share_waits_for_the_scheduler(): void {
		$at = gmdate( 'c', time() + HOUR_IN_SECONDS );

		$data = $this->share( array( 'scheduled_at' => $at ) );
		$row  = Queue::find( $data['created'][0] );

		$this->assertArrayNotHasKey( 'results', $data );
		$this->assertSame( 'scheduled', $row['status'] );
		$this->assertSame( array(), $this->requests_to( '/feed' ) );
		$this->assertNotFalse( wp_next_scheduled( Publisher::CRON_HOOK, array( strtotime( $at ) ) ) );

		$items = $this->rest( 'GET', '/queue', array( 'from' => gmdate( 'c' ), 'to' => gmdate( 'c', time() + DAY_IN_SECONDS ) ) )->get_data();
		$this->assertSame( array( (string) $data['created'][0] ), array_map( 'strval', array_column( $items, 'id' ) ) );
	}

	public function test_the_scheduler_sends_due_shares_only(): void {
		$due   = $this->share( array( 'scheduled_at' => gmdate( 'c', time() + 60 ) ) )['created'][0];
		$later = $this->share( array( 'scheduled_at' => gmdate( 'c', time() + DAY_IN_SECONDS ) ) )['created'][0];
		Queue::update( $due, array( 'scheduled_at' => gmdate( 'Y-m-d H:i:s', time() - 60 ) ) );

		( new Publisher( \SocialIntegrations\Plugin::instance()->networks ) )->run();

		$this->assertSame( 'published', Queue::find( $due )['status'] );
		$this->assertSame( 'scheduled', Queue::find( $later )['status'] );
		$this->assertCount( 1, $this->requests_to( '/feed' ) );
	}

	public function test_edit_a_scheduled_share(): void {
		$id = $this->share( array( 'scheduled_at' => gmdate( 'c', time() + HOUR_IN_SECONDS ) ) )['created'][0];
		$at = gmdate( 'c', time() + 2 * HOUR_IN_SECONDS );

		$response = $this->rest( 'POST', "/queue/$id", array( 'caption' => '<b>New</b> text', 'scheduled_at' => $at ) );

		$this->assertSame( 200, $response->get_status() );
		$row = Queue::find( $id );
		$this->assertSame( 'New text', $row['caption'] );
		$this->assertSame( gmdate( 'Y-m-d H:i:s', strtotime( $at ) ), $row['scheduled_at'] );
		$this->assertSame( 400, $this->rest( 'POST', "/queue/$id", array( 'scheduled_at' => 'not a date' ) )->get_status() );
	}

	public function test_a_draft_is_not_sent(): void {
		$data = $this->share( array( 'draft' => true ) );

		$this->assertSame( 'draft', Queue::find( $data['created'][0] )['status'] );
		$this->assertSame( array(), $this->requests_to( '/feed' ) );
	}

	public function test_delete_a_share(): void {
		$id = $this->share( array( 'draft' => true ) )['created'][0];

		$this->assertTrue( $this->rest( 'DELETE', "/queue/$id" )->get_data()['deleted'] );
		$this->assertNull( Queue::find( $id ) );
		$this->assertSame( 404, $this->rest( 'DELETE', "/queue/$id" )->get_status() );
	}

	public function test_create_checks_the_body(): void {
		$this->assertSame( 'sint_no_accounts', $this->rest( 'POST', '/queue', array( 'caption' => 'x' ) )->get_data()['code'] );
		$this->assertSame( 'sint_bad_date', $this->rest( 'POST', '/queue', array( 'caption' => 'x', 'accounts' => array( $this->account ), 'scheduled_at' => 'soon' ) )->get_data()['code'] );
		$this->assertSame( 404, $this->rest( 'POST', '/queue', array( 'post_id' => 999999, 'accounts' => array( $this->account ) ) )->get_status() );
	}

	public function test_delete_log_entries(): void {
		$this->share();
		$key = $this->rest( 'GET', '/logs' )->get_data()['items'][0]['key'];

		$this->assertSame( 400, $this->rest( 'POST', '/logs/delete', array( 'keys' => array() ) )->get_status() );
		$this->assertSame( 1, $this->rest( 'POST', '/logs/delete', array( 'keys' => array( $key ) ) )->get_data()['deleted'] );
		$this->assertSame( 0, $this->rest( 'GET', '/logs' )->get_data()['total'] );
	}

	public function test_the_campaign_shows_on_the_campaigns_screen(): void {
		$this->share();

		$campaigns = $this->rest( 'GET', '/campaigns' )->get_data();

		$this->assertSame( 'single', $campaigns[0]['type'] );
		$this->assertSame( 'Hello from the shop', $campaigns[0]['name'] );
		$this->assertSame( 'published', $campaigns[0]['status'] );
		$this->assertSame( 1, $campaigns[0]['sent'] );
	}

	public function test_the_campaigns_screen_names_the_user_who_made_the_campaign(): void {
		wp_update_user( array( 'ID' => get_current_user_id(), 'display_name' => 'Jane Doe' ) );
		$this->share();

		$campaign = $this->rest( 'GET', '/campaigns' )->get_data()[0];

		$this->assertSame( get_current_user_id(), $campaign['created_by'] );
		$this->assertSame( 'Jane Doe', $campaign['author'] );
	}

	public function test_deletes_fire_their_actions(): void {
		$fired = array();
		foreach ( array( Hooks::CAMPAIGN_DELETED, Hooks::SHARE_DELETED, Hooks::LOGS_DELETED ) as $hook ) {
			add_action(
				$hook,
				static function ( ...$args ) use ( &$fired, $hook ) {
					$fired[ $hook ] = $args;
				},
				10,
				3
			);
		}
		$draft = $this->share( array( 'draft' => true ) );
		$this->rest( 'DELETE', '/queue/' . $draft['created'][0] );
		$this->rest( 'DELETE', '/campaigns/' . $draft['id'] );
		$this->share();
		$key = $this->rest( 'GET', '/logs' )->get_data()['items'][0]['key'];
		$this->rest( 'POST', '/logs/delete', array( 'keys' => array( $key ) ) );

		$this->assertSame( $draft['created'][0], (int) $fired[ Hooks::SHARE_DELETED ][0]['id'] );
		$this->assertSame( array( $draft['id'], 'single' ), array_slice( $fired[ Hooks::CAMPAIGN_DELETED ], 0, 2 ) );
		$this->assertSame( 'Hello from the shop', $fired[ Hooks::CAMPAIGN_DELETED ][2]['name'] );
		$this->assertSame( array( array( $key ), 1 ), $fired[ Hooks::LOGS_DELETED ] );
	}
}
