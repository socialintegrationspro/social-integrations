<?php
/**
 * Sends due shares.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Scheduler;

use SocialIntegrations\Hooks;
use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Networks\NetworkException;
use SocialIntegrations\Networks\Registry;

defined( 'ABSPATH' ) || exit;

/**
 * Runs on WP-Cron: one event at each share's time, plus a check every minute
 * for shares an event missed.
 */
final class Publisher {

	const CRON_HOOK     = 'sint_run_queue';
	const CRON_SCHEDULE = 'sint_every_minute';

	/**
	 * Network registry.
	 *
	 * @var Registry
	 */
	private $networks;

	/**
	 * Constructor.
	 *
	 * @param Registry $networks Network registry.
	 */
	public function __construct( Registry $networks ) {
		$this->networks = $networks;
	}

	/**
	 * Registers the cron hooks.
	 */
	public function register(): void {
		add_filter( 'cron_schedules', array( $this, 'add_schedule' ) ); // phpcs:ignore WordPress.WP.CronInterval.CronSchedulesInterval
		add_action( self::CRON_HOOK, array( $this, 'run' ) );
		add_action(
			'init',
			static function () {
				if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
					wp_schedule_event( time() + 60, self::CRON_SCHEDULE, self::CRON_HOOK );
				}
			}
		);
	}

	/**
	 * Adds the one-minute schedule.
	 *
	 * @param array $schedules Schedules.
	 */
	public function add_schedule( array $schedules ): array {
		$schedules[ self::CRON_SCHEDULE ] = array(
			'interval' => MINUTE_IN_SECONDS,
			'display'  => __( 'Every minute', 'social-integrations' ),
		);
		return $schedules;
	}

	/**
	 * Asks WP-Cron to run at a given time.
	 *
	 * @param int $timestamp Unix time.
	 */
	public static function wake_at( int $timestamp ): void {
		// Positional argument: WordPress passes cron args by position, and an
		// associative key would reach run() as a named parameter on PHP 8.
		wp_schedule_single_event( max( time(), $timestamp ), self::CRON_HOOK, array( $timestamp ) );
	}

	/**
	 * Sends every due share.
	 *
	 * @param int $at Time the event was scheduled for. Only makes each event unique.
	 */
	public function run( $at = 0 ): void { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.Found
		foreach ( Queue::due( 20 ) as $job ) {
			if ( Queue::claim( $job['id'] ) ) {
				$this->send( $job );
			}
		}
	}

	/**
	 * Sends one share now and records the result.
	 *
	 * @param array $job Queue row.
	 * @return array ['status', 'message', 'remote_id', 'remote_url'].
	 */
	public function send( array $job ): array {
		$account = Accounts::get( (string) $job['account_id'] );
		$network = $this->networks->get( (string) $job['network'] );

		try {
			if ( ! $account || ! $network ) {
				throw new NetworkException( 'missing', __( 'The account is no longer connected.', 'social-integrations' ) );
			}
			if ( 'expired' === ( $account['status'] ?? '' ) ) {
				/* translators: %s: network name */
				throw new NetworkException( 'expired', sprintf( __( '%s sign-in expired. Reconnect the account.', 'social-integrations' ), $network->label() ) );
			}

			$answer = $network->publish( (array) $account['credentials'], $this->payload( $job ) );
			if ( ! empty( $answer['credentials'] ) && is_array( $answer['credentials'] ) ) {
				Accounts::update_credentials( (string) $job['account_id'], $answer['credentials'] );
			}
			$result = array(
				'status'     => 'published',
				'message'    => '',
				'remote_id'  => (string) ( $answer['remote_id'] ?? '' ),
				'remote_url' => (string) ( $answer['remote_url'] ?? '' ),
			);
		} catch ( NetworkException $e ) {
			if ( $e->is_expired() && $account ) {
				Accounts::set_status( (string) $job['account_id'], 'expired' );
			}
			$result = array(
				'status'  => 'failed',
				'message' => $e->getMessage(),
			);
		} catch ( \Throwable $e ) {
			$result = array(
				'status'  => 'failed',
				'message' => __( 'The share stopped because of an unexpected error.', 'social-integrations' ),
			);
		}

		Queue::update( (int) $job['id'], array( 'status' => $result['status'] ) );
		Queue::log( $job, $result );
		do_action( Hooks::SHARE_COMPLETED, $result, $job );
		return $result;
	}

	/**
	 * Payload for AbstractNetwork::publish().
	 *
	 * @param array $job Queue row.
	 */
	private function payload( array $job ): array {
		$images = array();
		$videos = array();
		foreach ( (array) $job['media'] as $item ) {
			$id   = (int) ( $item['id'] ?? 0 );
			$path = $id ? (string) get_attached_file( $id ) : '';
			$file = array(
				'url'  => (string) ( $item['url'] ?? '' ),
				'alt'  => (string) ( $item['alt'] ?? '' ),
				'path' => $path && is_readable( $path ) ? $path : '',
			);
			if ( 'video' === ( $item['type'] ?? 'image' ) ) {
				$videos[] = $file;
			} else {
				$images[] = $file;
			}
		}
		return array(
			'message' => (string) $job['caption'],
			'link'    => (string) $job['link'],
			'images'  => $images,
			'videos'  => $videos,
		);
	}
}
