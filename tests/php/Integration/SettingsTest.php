<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Integration;

// phpcs:ignoreFile

final class SettingsTest extends IntegrationTestCase {

	public function set_up(): void {
		parent::set_up();
		$this->login();
	}

	public function test_save_and_read_settings(): void {
		$saved = $this->rest( 'POST', '/settings', array( 'max_images' => 50, 'log_days' => 90, 'block_fallback' => 'skip' ) )->get_data();

		$this->assertSame( 10, $saved['max_images'] );
		$this->assertSame( 90, $saved['log_days'] );

		$read = $this->rest( 'GET', '/settings' )->get_data();
		$this->assertSame( 'skip', $read['block_fallback'] );
		$this->assertArrayHasKey( 'ai_providers', $read );
	}

	public function test_ai_keys_are_never_sent_back(): void {
		$this->rest( 'POST', '/settings', array( 'ai_keys' => array( 'openai' => 'sk-test-secret' ) ) );

		$this->assertStringNotContainsString( 'sk-test-secret', wp_json_encode( $this->rest( 'GET', '/settings' )->get_data() ) );
		$this->assertStringNotContainsString( 'sk-test-secret', serialize( wp_load_alloptions() ) );
	}

	public function test_blocks_list_core_blocks_with_their_rule(): void {
		$data  = $this->rest( 'GET', '/blocks' )->get_data();
		$names = array_column( $data['blocks'], 'name' );
		$rules = array_column( $data['blocks'], 'use', 'name' );

		$this->assertContains( 'core/paragraph', $names );
		$this->assertSame( 'excerpt', $rules['core/paragraph'] );
		$this->assertContains( 'core/list-item', $names );
		$this->assertSame( 'text', $data['fallback'] );
		$this->assertNotContains( 'core/post-title', $names );
	}

	public function test_dashboard_counts_shares(): void {
		$account = $this->telegram();
		$this->rest( 'POST', '/queue', array( 'caption' => 'x', 'accounts' => array( $account ) ) );

		$data = $this->rest( 'GET', '/dashboard' )->get_data();

		$this->assertSame( 200, $this->rest( 'GET', '/dashboard' )->get_status() );
		$this->assertStringContainsString( 'published', wp_json_encode( $data ) );
	}
}
