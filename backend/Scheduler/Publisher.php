<?php
/**
 * Sends due shares.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Scheduler;

use SocialIntegrations\Auth\Broker;
use SocialIntegrations\Content\PostFields;
use SocialIntegrations\Support\Cron;
use SocialIntegrations\Support\Errors;
use SocialIntegrations\Hooks;
use SocialIntegrations\Networks\AbstractNetwork;
use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Networks\NetworkException;
use SocialIntegrations\Networks\Registry;
use SocialIntegrations\Plugin;
use SocialIntegrations\Templates\RichText;

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
		Cron::ensure( self::CRON_HOOK, self::CRON_SCHEDULE, 60 );
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
		// Positional argument: WordPress passes cron args by position. On PHP 8,
		// PHP gives an associative key to run() as a named parameter.
		wp_schedule_single_event( max( time(), $timestamp ), self::CRON_HOOK, array( $timestamp ) );
	}

	/**
	 * Claims one share and sends it now, during this request.
	 *
	 * @param int $id Queue row ID.
	 * @return array|null The result of send(), or null when another process claimed the share first.
	 */
	public static function send_now( int $id ): ?array {
		if ( ! Queue::claim( $id ) ) {
			return null;
		}
		return ( new self( Plugin::instance()->networks ) )->send( Queue::find( $id ) );
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

	// phpcs:disable Squiz.Commenting.FunctionCommentThrowTag.Missing -- send() catches its own exceptions.
	/**
	 * Sends one share now and records the result. Errors go into the result, not to the caller.
	 *
	 * @param array $job Queue row.
	 * @return array ['status', 'message', 'remote_id', 'remote_url'].
	 */
	public function send( array $job ): array {
		// phpcs:enable Squiz.Commenting.FunctionCommentThrowTag.Missing
		$account = Accounts::get( (string) $job['account_id'] );
		$network = $this->networks->get( (string) $job['network'] );
		// What the network answered, without secrets, so a developer can read it in the share log.
		$details = array();
		if ( $network ) {
			$network->take_trace();
		}

		try {
			if ( ! $account || ! $network ) {
				throw new NetworkException( 'missing', esc_html__( 'The account is no longer connected.', 'social-integrations' ) );
			}
			if ( 'expired' === ( $account['status'] ?? '' ) ) {
				/* translators: %s: network name */
				throw new NetworkException( 'expired', esc_html( sprintf( __( '%s sign-in expired. Reconnect the account.', 'social-integrations' ), $network->label() ) ) );
			}

			$credentials = $this->fresh_credentials( $network, $account );
			$payload     = $this->styled( $network, PostFields::apply_format( $network, $this->payload( $job ) ) );
			$answer      = $network->publish( $credentials, $payload );
			if ( ! empty( $answer['credentials'] ) && is_array( $answer['credentials'] ) ) {
				$credentials = array_merge( $credentials, $answer['credentials'] );
				Accounts::update_credentials( (string) $job['account_id'], $answer['credentials'] );
			}
			$result = array(
				'status'     => 'published',
				'message'    => $this->first_comment( $network, $credentials, $answer, $payload, $details ),
				'remote_id'  => (string) ( $answer['remote_id'] ?? '' ),
				'remote_url' => (string) ( $answer['remote_url'] ?? '' ),
			);
		} catch ( \Throwable $e ) {
			list( $result, $details ) = $this->failure( $e, (string) $job['account_id'], (bool) $account );
		}
		if ( $network ) {
			$details['requests'] = $network->take_trace();
		}
		$result['details'] = $details;
		$result            = (array) apply_filters( Hooks::SHARE_RESULT, $result, $job );

		Queue::update( (int) $job['id'], array( 'status' => $result['status'] ) );
		Queue::log( $job, $result );
		do_action( Hooks::SHARE_COMPLETED, $result, $job );
		return $result;
	}

	/**
	 * The caption and the first comment with their styles converted for the network. The other
	 * fields, such as a link card title, have no styles: they get the text only.
	 *
	 * @param AbstractNetwork $network Network.
	 * @param array           $payload Share payload.
	 */
	private function styled( AbstractNetwork $network, array $payload ): array {
		$payload['message'] = $network->format_text( (string) $payload['message'] );
		foreach ( (array) $payload['fields'] as $name => $value ) {
			if ( is_string( $value ) ) {
				$payload['fields'][ $name ] = 'first_comment' === $name ? $network->format_text( $value ) : RichText::plain( $value );
			}
		}
		return $payload;
	}

	/**
	 * Adds the 'first_comment' field below a published post. A comment that fails does not
	 * change the share's status: the post is on the network.
	 *
	 * @param AbstractNetwork $network     Network.
	 * @param array           $credentials Credentials.
	 * @param array           $answer      What publish() returned.
	 * @param array           $payload     Share payload.
	 * @param array           $details     Log details; gets 'comment'.
	 * @return string A message for the share log, or '' when there is no problem.
	 */
	private function first_comment( AbstractNetwork $network, array $credentials, array $answer, array $payload, array &$details ): string {
		$text = trim( (string) ( $payload['fields']['first_comment'] ?? '' ) );
		if ( '' === $text || ! $network->post_field( 'first_comment' ) ) {
			return '';
		}
		try {
			$comment            = $network->add_comment( $credentials, $answer, $text );
			$details['comment'] = array( 'remote_id' => (string) ( $comment['remote_id'] ?? '' ) );
			return '';
		} catch ( \Throwable $e ) {
			$details['comment'] = array(
				'code'  => $e instanceof NetworkException ? $e->error_code() : 'exception',
				'error' => Errors::text( $e ),
			);
			// A refused permission is the usual cause: the account was connected before the plugin asked
			// for comments. The user can fix that, so say how. The details keep the network's own text.
			$status = $e instanceof NetworkException ? (int) $e->getCode() : 0;
			if ( 401 === $status || 403 === $status || ( $e instanceof NetworkException && $e->is_expired() ) || false !== stripos( Errors::text( $e ), 'permission' ) ) {
				// The share log shows a Reconnect button for this share.
				$details['comment']['reconnect'] = true;
				/* translators: %s: network name */
				return sprintf( __( 'The post is on %s. The network did not allow the first comment. Reconnect the account to give the plugin permission for comments.', 'social-integrations' ), $network->label() );
			}
			/* translators: 1: network name, 2: reason */
			return sprintf( __( 'The post is on %1$s. The first comment failed: %2$s', 'social-integrations' ), $network->label(), Errors::text( $e ) );
		}
	}

	/**
	 * The result and the log details for a share that failed.
	 *
	 * A network error gives its message to the user. When the sign-in expired, the
	 * account gets the 'expired' status. Any other error gives a general message, and
	 * the details keep the exception for a developer.
	 *
	 * @param \Throwable $e           The error.
	 * @param string     $account_id  Account ID.
	 * @param bool       $has_account True when the account exists.
	 * @return array [ result ['status', 'message'], details ].
	 */
	private function failure( \Throwable $e, string $account_id, bool $has_account ): array {
		if ( $e instanceof NetworkException ) {
			if ( $e->is_expired() && $has_account ) {
				Accounts::set_status( $account_id, 'expired' );
			}
			return array(
				array(
					'status'  => 'failed',
					'message' => Errors::text( $e ),
				),
				array(
					'code'   => $e->error_code(),
					'status' => (int) $e->getCode(),
				),
			);
		}
		return array(
			array(
				'status'  => 'failed',
				'message' => __( 'The share stopped because of an unexpected error.', 'social-integrations' ),
			),
			array(
				'code'      => 'exception',
				'exception' => array(
					'class'   => get_class( $e ),
					'message' => Errors::text( $e ),
					'file'    => str_replace( wp_normalize_path( ABSPATH ), '', wp_normalize_path( $e->getFile() ) ) . ':' . $e->getLine(),
				),
			),
		);
	}

	/**
	 * Renews credentials that expire within five minutes, when the network can.
	 * A failed renewal keeps the old ones; the share then reports the sign-in problem.
	 *
	 * An account that signed in with the Social Integrations app renews on that server,
	 * because the server keeps the app secret.
	 *
	 * @param AbstractNetwork $network Network.
	 * @param array           $account Account from Accounts::get().
	 */
	private function fresh_credentials( AbstractNetwork $network, array $account ): array {
		$account_id  = (string) $account['id'];
		$credentials = (array) $account['credentials'];
		$expires     = (int) ( $credentials['expires_at'] ?? 0 );
		if ( ! $expires || $expires - 5 * MINUTE_IN_SECONDS > time() ) {
			return $credentials;
		}
		try {
			$fresh = 'broker' === $account['via']
				? Broker::refresh( $network, $credentials )
				: $network->refresh( Accounts::app( $network->key() ), $credentials );
		} catch ( NetworkException $e ) {
			return $credentials;
		}
		if ( empty( $fresh['access_token'] ) ) {
			return $credentials;
		}
		$fresh = array_merge( $credentials, $fresh );
		Accounts::update_credentials( $account_id, $fresh );
		do_action( Hooks::CREDENTIALS_RENEWED, $account_id, $credentials, $fresh, $network->key() );
		return $fresh;
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
			'fields'  => (array) ( $job['fields'] ?? array() ),
		);
	}
}
