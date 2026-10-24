<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Integration;

use SocialIntegrations\Database\Migrations;
use SocialIntegrations\Plugin;
use SocialIntegrations\Support\Settings;

// phpcs:ignoreFile

final class PluginTest extends IntegrationTestCase {

	public function test_plugin_boots_and_fires_loaded(): void {
		$this->assertInstanceOf( Plugin::class, Plugin::instance() );
		$this->assertSame( 1, did_action( 'sint/loaded' ) );
	}

	public function test_activation_creates_the_tables_and_the_settings(): void {
		global $wpdb;
		foreach ( array( Migrations::queue_table(), Migrations::logs_table(), Migrations::campaigns_table() ) as $table ) {
			$this->assertSame( $table, $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) );
		}
		$this->assertSame( Settings::defaults()['blocks'], Settings::get( 'blocks' ) );
	}

	public function test_free_networks_are_registered(): void {
		$this->assertSame(
			array( 'facebook', 'linkedin' ),
			array_keys( Plugin::instance()->networks->all() )
		);
	}
}
