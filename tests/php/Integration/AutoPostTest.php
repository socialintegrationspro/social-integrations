<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Integration;

use SocialIntegrations\Scheduler\AutoShare;
use SocialIntegrations\Scheduler\Publisher;
use SocialIntegrations\Scheduler\Queue;

// phpcs:ignoreFile

/**
 * An auto-post campaign shares a post once, when it is first published.
 */
final class AutoPostTest extends IntegrationTestCase {

	/** @var string */
	private $account;

	public function set_up(): void {
		parent::set_up();
		$this->login();
		$this->account = $this->telegram();
	}

	private function campaign( array $body = array() ): array {
		$response = $this->rest(
			'POST',
			'/campaigns/auto',
			$body + array(
				'name'       => 'Blog posts',
				'post_types' => array( 'post' ),
				'accounts'   => array( $this->account ),
				'caption'    => "{title}\n\n{url}",
				'delay'      => array( 'value' => 10, 'unit' => 'minutes' ),
			)
		);
		$this->assertSame( 200, $response->get_status(), wp_json_encode( $response->get_data() ) );
		return $response->get_data();
	}

	private function shares_of( int $post_id ): array {
		return Queue::for_post( $post_id );
	}

	public function test_a_campaign_needs_a_name(): void {
		$this->assertSame( 'sint_name_required', $this->rest( 'POST', '/campaigns/auto', array( 'name' => ' ' ) )->get_data()['code'] );
	}

	public function test_publish_queues_the_post_once_with_the_delay(): void {
		$campaign = $this->campaign();
		$post_id  = self::factory()->post->create( array( 'post_title' => 'Big sale', 'post_status' => 'draft' ) );

		wp_publish_post( $post_id );

		$this->assertNotEmpty( get_post_meta( $post_id, AutoShare::META_SHARED, true ) );
		$this->assertNotFalse( wp_next_scheduled( AutoShare::CRON_HOOK, array( $post_id ) ) );

		// WP-Cron runs the event 15 seconds later.
		do_action( AutoShare::CRON_HOOK, $post_id );
		$shares = $this->shares_of( $post_id );

		$this->assertCount( 1, $shares );
		$this->assertSame( 'scheduled', $shares[0]['status'] );
		$this->assertSame( 'auto-' . $campaign['id'], $shares[0]['campaign_key'] );
		$this->assertSame( "Big sale\n\n" . get_permalink( $post_id ), $shares[0]['caption'] );
		$published = (int) get_post_time( 'U', true, $post_id );
		$this->assertEqualsWithDelta( max( time(), $published + 600 ), strtotime( $shares[0]['scheduled_at'] . ' UTC' ), 2 );
		$this->assertNotFalse( wp_next_scheduled( Publisher::CRON_HOOK, array( strtotime( $shares[0]['scheduled_at'] . ' UTC' ) ) ) );

		// A second publish of the post does not share it again.
		wp_clear_scheduled_hook( AutoShare::CRON_HOOK, array( $post_id ) );
		wp_update_post( array( 'ID' => $post_id, 'post_status' => 'draft' ) );
		wp_publish_post( $post_id );
		$this->assertFalse( wp_next_scheduled( AutoShare::CRON_HOOK, array( $post_id ) ) );
	}

	public function test_posts_without_a_campaign_are_not_shared(): void {
		$post_id = self::factory()->post->create( array( 'post_status' => 'publish' ) );

		$this->assertEmpty( get_post_meta( $post_id, AutoShare::META_SHARED, true ) );
		$this->assertFalse( wp_next_scheduled( AutoShare::CRON_HOOK, array( $post_id ) ) );
	}

	public function test_a_paused_campaign_or_another_post_type_does_not_share(): void {
		$campaign = $this->campaign();
		$this->rest( 'POST', '/campaigns/' . $campaign['id'] . '/active', array( 'active' => false ) );
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );

		$this->assertFalse( wp_next_scheduled( AutoShare::CRON_HOOK, array( $post ) ) );

		$this->rest( 'POST', '/campaigns/' . $campaign['id'] . '/active', array( 'active' => true ) );
		$page = self::factory()->post->create( array( 'post_status' => 'publish', 'post_type' => 'page' ) );
		$this->assertFalse( wp_next_scheduled( AutoShare::CRON_HOOK, array( $page ) ) );
	}

	public function test_a_post_with_a_password_or_turned_off_is_not_shared(): void {
		$this->campaign();
		$secret = self::factory()->post->create( array( 'post_status' => 'publish', 'post_password' => 'x' ) );
		$off    = self::factory()->post->create( array( 'post_status' => 'draft' ) );
		update_post_meta( $off, AutoShare::META_DISABLED, '1' );
		wp_publish_post( $off );

		$this->assertFalse( wp_next_scheduled( AutoShare::CRON_HOOK, array( $secret ) ) );
		$this->assertFalse( wp_next_scheduled( AutoShare::CRON_HOOK, array( $off ) ) );
	}

	public function test_an_account_gets_the_post_from_the_first_campaign_only(): void {
		$first = $this->campaign( array( 'name' => 'First', 'caption' => 'one {title}' ) );
		$this->campaign( array( 'name' => 'Second', 'caption' => 'two {title}' ) );
		$post_id = self::factory()->post->create( array( 'post_title' => 'T', 'post_status' => 'publish' ) );

		do_action( AutoShare::CRON_HOOK, $post_id );
		$shares = $this->shares_of( $post_id );

		$this->assertCount( 1, $shares );
		$this->assertSame( 'auto-' . $first['id'], $shares[0]['campaign_key'] );
		$this->assertStringStartsWith( 'one T', $shares[0]['caption'] );
	}

	public function test_other_plugins_can_refuse_a_post(): void {
		$this->campaign();
		add_filter( 'sint/auto_campaign_matches', '__return_false' );
		$post_id = self::factory()->post->create( array( 'post_status' => 'publish' ) );

		do_action( AutoShare::CRON_HOOK, $post_id );

		$this->assertSame( array(), $this->shares_of( $post_id ) );
	}

	public function test_an_expired_account_gets_no_share(): void {
		$this->campaign();
		\SocialIntegrations\Networks\Accounts::set_status( $this->account, 'expired' );
		$post_id = self::factory()->post->create( array( 'post_status' => 'publish' ) );

		do_action( AutoShare::CRON_HOOK, $post_id );

		$this->assertSame( array(), $this->shares_of( $post_id ) );
	}
}
