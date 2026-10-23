<?php
/**
 * Client for the Social Integrations app at app.socialintegrations.com.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Auth;

use SocialIntegrations\Networks\AbstractNetwork;
use SocialIntegrations\Networks\NetworkException;
use SocialIntegrations\Support\Encryption;

defined( 'ABSPATH' ) || exit;

/**
 * The Social Integrations app keeps the app secrets of the networks. It signs in for the
 * site, exchanges the code, and keeps the result for two minutes. The site then claims the
 * result server to server. The secrets never come to the site or to the browser, and the
 * server does not keep tokens.
 *
 * The site registers once. It keeps a random token for a short time, and the server calls
 * GET sint/v1/broker/verify with a challenge; the site answers with an HMAC of the challenge.
 * The site then signs each request with its site secret.
 *
 * Define SINT_BROKER_URL to use another server, for example in development.
 */
final class Broker {

	const DEFAULT_URL       = 'https://app.socialintegrations.com';
	const OPTION            = 'sint_broker_site';
	const NETWORKS_CACHE    = 'sint_broker_networks';
	const VERIFY_TRANSIENT  = 'sint_broker_verify';
	const NETWORKS_TTL      = 12 * HOUR_IN_SECONDS;
	const NETWORKS_FAIL_TTL = 10 * MINUTE_IN_SECONDS;

	/**
	 * Hooks the verify route.
	 */
	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Registers GET sint/v1/broker/verify. It is public, because the server calls it, and it
	 * answers only while this site registers.
	 */
	public function register_routes(): void {
		register_rest_route(
			OAuth::REST_NAMESPACE,
			'/broker/verify',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'verify' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'challenge' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);
	}

	/**
	 * GET /broker/verify — proves to the server that this site asked to register.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function verify( \WP_REST_Request $request ) {
		$token = get_transient( self::VERIFY_TRANSIENT );
		if ( ! is_string( $token ) || '' === $token ) {
			return new \WP_Error( 'sint_not_registering', 'Not registering.', array( 'status' => 404 ) );
		}
		return rest_ensure_response( array( 'response' => hash_hmac( 'sha256', (string) $request['challenge'], $token ) ) );
	}

	/**
	 * Address of the server, without a trailing slash.
	 */
	public static function base_url(): string {
		$url = defined( 'SINT_BROKER_URL' ) && SINT_BROKER_URL ? (string) SINT_BROKER_URL : self::DEFAULT_URL;
		return untrailingslashit( $url );
	}

	/**
	 * Whether the Social Integrations app can sign in to a network.
	 *
	 * @param AbstractNetwork $network Network.
	 */
	public static function supports( AbstractNetwork $network ): bool {
		$key = $network->broker_key();
		return 'oauth2' === $network->auth_type() && '' !== $key && in_array( $key, self::networks(), true );
	}

	/**
	 * Keys of the networks that the server supports. The plugin keeps the list for 12 hours;
	 * when the server does not answer, the list is empty for 10 minutes.
	 *
	 * @return string[]
	 */
	public static function networks(): array {
		$cached = get_transient( self::NETWORKS_CACHE );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$keys = array();
		try {
			$body = self::request( 'GET', '/v1/networks', array( 'timeout' => 5 ) );
			foreach ( (array) ( $body['networks'] ?? array() ) as $network ) {
				if ( ! empty( $network['key'] ) ) {
					$keys[] = sanitize_key( (string) $network['key'] );
				}
			}
			set_transient( self::NETWORKS_CACHE, $keys, self::NETWORKS_TTL );
		} catch ( NetworkException $e ) {
			set_transient( self::NETWORKS_CACHE, $keys, self::NETWORKS_FAIL_TTL );
		}
		return $keys;
	}

	/**
	 * Starts a sign-in on the server and returns the network's sign-in URL.
	 *
	 * @param AbstractNetwork $network Network.
	 * @param string          $state   State that the server returns to the callback.
	 * @throws NetworkException When the server refuses.
	 */
	public static function connect( AbstractNetwork $network, string $state ): string {
		$body = self::signed(
			'/v1/connect',
			array(
				'network'    => $network->broker_key(),
				'state'      => $state,
				'return_url' => OAuth::redirect_uri(),
			)
		);
		$url  = (string) ( $body['authorize_url'] ?? '' );
		if ( '' === $url ) {
			throw new NetworkException( 'broker', esc_html__( 'The Social Integrations app did not return a sign-in address. Try again.', 'social-integrations' ) );
		}
		return $url;
	}

	/**
	 * The credentials of a finished sign-in. The server gives them once.
	 *
	 * @param string $handoff Handoff code from the callback URL.
	 * @throws NetworkException When the sign-in expired.
	 */
	public static function claim( string $handoff ): array {
		$body = self::signed( '/v1/claim', array( 'handoff' => $handoff ) );
		if ( empty( $body['credentials'] ) || ! is_array( $body['credentials'] ) ) {
			throw new NetworkException( 'broker', esc_html__( 'The sign-in expired. Connect again.', 'social-integrations' ) );
		}
		return $body['credentials'];
	}

	/**
	 * Renews credentials with the app secret on the server. Null when the token cannot be renewed.
	 *
	 * @param AbstractNetwork $network     Network.
	 * @param array           $credentials Current credentials.
	 * @throws NetworkException When the server or the network refuses.
	 */
	public static function refresh( AbstractNetwork $network, array $credentials ): ?array {
		$body = self::signed(
			'/v1/refresh',
			array(
				'network'     => $network->broker_key(),
				'credentials' => $credentials,
			)
		);
		return ! empty( $body['credentials'] ) && is_array( $body['credentials'] ) ? $body['credentials'] : null;
	}

	/**
	 * Sends a signed request. When the server does not know the site, the site registers
	 * again and sends the request one more time.
	 *
	 * @param string $path Path on the server, from the root.
	 * @param array  $data Body.
	 * @throws NetworkException When the server refuses.
	 */
	private static function signed( string $path, array $data ): array {
		$body = (string) wp_json_encode( $data );
		for ( $try = 0; $try < 2; $try++ ) {
			$site      = self::site();
			$timestamp = (string) time();
			$signature = hash_hmac( 'sha256', "POST\n{$path}\n{$timestamp}\n" . hash( 'sha256', $body ), $site['secret'] );
			try {
				return self::request(
					'POST',
					$path,
					array(
						'headers' => array(
							'Content-Type'     => 'application/json',
							'X-Sint-Site'      => $site['id'],
							'X-Sint-Timestamp' => $timestamp,
							'X-Sint-Signature' => $signature,
						),
						'body'    => $body,
					)
				);
			} catch ( NetworkException $e ) {
				if ( 'signature' !== $e->error_code() || $try > 0 ) {
					throw $e;
				}
				delete_option( self::OPTION );
			}
		}
		throw new NetworkException( 'broker', esc_html__( 'The Social Integrations app did not accept this site. Try again.', 'social-integrations' ) );
	}

	/**
	 * The site ID and secret. Registers the site the first time.
	 *
	 * @return array ['id' => string, 'secret' => string].
	 * @throws NetworkException When the server does not register the site.
	 */
	private static function site(): array {
		$stored = Encryption::decrypt_array( (array) get_option( self::OPTION, array() ) );
		if ( ! empty( $stored['id'] ) && ! empty( $stored['secret'] ) ) {
			return $stored;
		}

		$token = wp_generate_password( 48, false, false );
		set_transient( self::VERIFY_TRANSIENT, $token, 5 * MINUTE_IN_SECONDS );
		try {
			$body = self::request(
				'POST',
				'/v1/sites',
				array(
					'headers' => array( 'Content-Type' => 'application/json' ),
					'body'    => (string) wp_json_encode(
						array(
							'home_url'     => home_url( '/' ),
							'callback_url' => OAuth::redirect_uri(),
							'verify_url'   => rest_url( OAuth::REST_NAMESPACE . '/broker/verify' ),
							'token'        => $token,
						)
					),
				)
			);
		} finally {
			delete_transient( self::VERIFY_TRANSIENT );
		}

		if ( empty( $body['site_id'] ) || empty( $body['site_secret'] ) ) {
			throw new NetworkException( 'broker', esc_html__( 'The Social Integrations app did not register this site. Try again.', 'social-integrations' ) );
		}
		$site = array(
			'id'     => (string) $body['site_id'],
			'secret' => (string) $body['site_secret'],
		);
		update_option( self::OPTION, Encryption::encrypt_array( $site ), false );
		return $site;
	}

	/**
	 * Sends a request to the server and returns the decoded body.
	 *
	 * @param string $method HTTP method.
	 * @param string $path   Path on the server.
	 * @param array  $args   Arguments for wp_remote_request().
	 * @throws NetworkException When the server does not answer or refuses.
	 */
	private static function request( string $method, string $path, array $args = array() ): array {
		$response = wp_remote_request(
			self::base_url() . $path,
			$args + array(
				'method'  => $method,
				'timeout' => 20,
			)
		);
		if ( is_wp_error( $response ) ) {
			throw new NetworkException( 'network', esc_html__( 'The plugin cannot reach the Social Integrations app. Try again, or use your own app.', 'social-integrations' ) );
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		$body   = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		$body   = is_array( $body ) ? $body : array();
		if ( $status >= 200 && $status < 300 ) {
			return $body;
		}

		$code    = sanitize_key( (string) ( $body['error']['code'] ?? '' ) );
		$message = sanitize_text_field( (string) ( $body['error']['message'] ?? '' ) );
		if ( '' === $message ) {
			$message = __( 'The Social Integrations app had a problem. Try again, or use your own app.', 'social-integrations' );
		}
		// The code and the status are for the plugin, not output. The message is escaped.
		throw new NetworkException( '' !== $code ? $code : 'broker', esc_html( $message ), $status ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
	}
}
