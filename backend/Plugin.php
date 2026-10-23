<?php
/**
 * Main plugin class.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations;

use SocialIntegrations\Admin\Assets;
use SocialIntegrations\Auth\OAuth;
use SocialIntegrations\Admin\Menu;
use SocialIntegrations\Database\Migrations;
use SocialIntegrations\Editor\BlockSupport;
use SocialIntegrations\Editor\SidebarPanel;
use SocialIntegrations\Networks\Registry;
use SocialIntegrations\Rest\AccountsController;
use SocialIntegrations\Rest\AIController;
use SocialIntegrations\Rest\CampaignsController;
use SocialIntegrations\Rest\ContentController;
use SocialIntegrations\Rest\DashboardController;
use SocialIntegrations\Rest\EditorController;
use SocialIntegrations\Rest\QueueController;
use SocialIntegrations\Rest\SettingsController;
use SocialIntegrations\Scheduler\AutoShare;
use SocialIntegrations\Scheduler\Publisher;
use SocialIntegrations\Scheduler\Queue;
use SocialIntegrations\Support\Cron;
use SocialIntegrations\Support\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Wires the services together.
 */
final class Plugin {

	/**
	 * Daily cron hook that deletes old share log rows.
	 */
	const PRUNE_HOOK = 'sint_prune_logs';

	/**
	 * The booted instance.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * Network registry.
	 *
	 * @var Registry
	 */
	public $networks;

	/**
	 * Boots the plugin once, on `plugins_loaded`.
	 */
	public static function boot(): void {
		if ( null !== self::$instance ) {
			return;
		}
		self::$instance = new self();
		self::$instance->register();

		do_action( Hooks::LOADED, self::$instance );
	}

	/**
	 * The booted instance.
	 */
	public static function instance(): ?Plugin {
		return self::$instance;
	}

	/**
	 * Registers hooks for every service.
	 */
	private function register(): void {
		$this->networks = new Registry();
		( new OAuth( $this->networks ) )->register();

		Migrations::maybe_upgrade();

		// Multisite: WordPress deletes the plugin's tables with a deleted site.
		add_filter(
			'wpmu_drop_tables',
			static function ( $tables ) {
				return array_merge( (array) $tables, array( Migrations::queue_table(), Migrations::logs_table(), Migrations::campaigns_table() ) );
			}
		);

		add_action( 'init', array( $this, 'load_textdomain' ) );
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );

		( new BlockSupport() )->register();
		( new SidebarPanel( $this->networks ) )->register();
		( new AutoShare() )->register();
		( new Publisher( $this->networks ) )->register();

		// Once a day, delete share log rows older than the period in Settings.
		add_action( self::PRUNE_HOOK, array( $this, 'prune_logs' ) );
		Cron::ensure( self::PRUNE_HOOK, 'daily', HOUR_IN_SECONDS );

		if ( is_admin() ) {
			( new Menu() )->register();
			( new Assets() )->register();
		}
	}

	/**
	 * Cron callback: deletes share log rows older than the "Keep the share log" setting.
	 */
	public function prune_logs(): void {
		Queue::prune_logs( (int) Settings::get( 'log_days', 0 ) );
	}

	/**
	 * Loads translations for older WordPress versions; 6.7+ loads them on demand.
	 */
	public function load_textdomain(): void {
		load_plugin_textdomain( 'social-integrations', false, dirname( plugin_basename( SINT_FILE ) ) . '/languages' );
	}

	/**
	 * Registers the REST routes for the admin app.
	 */
	public function register_routes(): void {
		( new ContentController() )->register_routes();
		( new SettingsController() )->register_routes();
		( new AccountsController( $this->networks ) )->register_routes();
		( new QueueController() )->register_routes();
		( new AIController() )->register_routes();
		( new CampaignsController() )->register_routes();
		( new EditorController() )->register_routes();
		( new DashboardController() )->register_routes();
	}
}
