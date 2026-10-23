<?php
/**
 * One OAuth sign-in, from the start URL to the code exchange.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Auth;

use SocialIntegrations\Networks\AbstractNetwork;
use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Networks\NetworkException;
use SocialIntegrations\Support\Errors;

defined( 'ABSPATH' ) || exit;

/**
 * Keeps the state of a sign-in for ten minutes and uses it once.
 *
 * A session holds the network key, the method that signs in and a context. The context
 * tells the callback who started the sign-in. The admin app uses
 * [ 'type' => 'admin', 'user_id' => int ]. Other plugins can start sessions with their
 * own context type and finish them through the `sint/oauth_callback` filter.
 *
 * Methods:
 * - 'app': the user's own developer app, from Accounts::app(). The callback gets a code.
 * - 'broker': the Social Integrations app (Broker). The server exchanges the code, and the
 *   callback gets a handoff code to claim the result.
 */
final class ConnectSession {

	const STATE_PREFIX = 'sint_oauth_state_';
	const STATE_TTL    = 10 * MINUTE_IN_SECONDS;
	const METHODS      = array( 'app', 'broker' );

	/**
	 * Starts a sign-in and returns the network's sign-in URL.
	 *
	 * @param AbstractNetwork $network OAuth network.
	 * @param string          $method  One of METHODS.
	 * @param array           $context ['type' => string, ...].
	 * @return string|\WP_Error
	 */
	public static function begin( AbstractNetwork $network, string $method, array $context ) {
		if ( ! in_array( $method, self::METHODS, true ) ) {
			return new \WP_Error( 'sint_bad_method', __( 'This sign-in method is not available.', 'social-integrations' ), array( 'status' => 400 ) );
		}
		if ( 'broker' === $method && ! Broker::supports( $network ) ) {
			return new \WP_Error(
				'sint_no_broker',
				/* translators: %s: network name */
				sprintf( __( 'The Social Integrations app cannot connect %s now. Use your own app.', 'social-integrations' ), $network->label() ),
				array( 'status' => 400 )
			);
		}
		if ( 'app' === $method && ! Accounts::has_app( $network->key() ) ) {
			return new \WP_Error(
				'sint_no_app',
				/* translators: %s: network name */
				sprintf( __( 'Enter the app ID and secret of your %s app first.', 'social-integrations' ), $network->label() ),
				array( 'status' => 400 )
			);
		}

		$state    = wp_generate_password( 40, false, false );
		$verifier = 'app' === $method && $network->pkce() ? wp_generate_password( 64, false, false ) : '';
		set_transient(
			self::STATE_PREFIX . $state,
			array(
				'network'  => $network->key(),
				'method'   => $method,
				'context'  => $context,
				'verifier' => $verifier,
			),
			self::STATE_TTL
		);

		if ( 'broker' === $method ) {
			try {
				return Broker::connect( $network, $state );
			} catch ( NetworkException $e ) {
				delete_transient( self::STATE_PREFIX . $state );
				return new \WP_Error( 'sint_broker', Errors::text( $e ), array( 'status' => 502 ) );
			}
		}

		$url = $network->authorization_url( Accounts::app( $network->key() ), OAuth::redirect_uri(), $state );
		if ( '' !== $url && '' !== $verifier ) {
			$challenge = rtrim( strtr( base64_encode( hash( 'sha256', $verifier, true ) ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- PKCE challenge, RFC 7636.
			$url       = add_query_arg(
				array(
					'code_challenge'        => $challenge,
					'code_challenge_method' => 'S256',
				),
				$url
			);
		}
		if ( '' === $url ) {
			delete_transient( self::STATE_PREFIX . $state );
			return new \WP_Error( 'sint_no_url', __( 'This network did not provide a sign-in address.', 'social-integrations' ), array( 'status' => 500 ) );
		}
		return $url;
	}

	/**
	 * The session for a state, once. Null when it is not known or it expired.
	 *
	 * @param string $state State from the callback URL.
	 * @return array|null ['network', 'method', 'context', 'verifier'].
	 */
	public static function take( string $state ): ?array {
		if ( '' === $state ) {
			return null;
		}
		$saved = get_transient( self::STATE_PREFIX . $state );
		delete_transient( self::STATE_PREFIX . $state );
		if ( ! is_array( $saved ) || empty( $saved['network'] ) ) {
			return null;
		}
		// Sessions from before methods and contexts came from the admin app.
		if ( ! isset( $saved['context'] ) ) {
			$saved['context'] = array(
				'type'    => 'admin',
				'user_id' => (int) ( $saved['user_id'] ?? 0 ),
			);
		}
		$saved['method'] = (string) ( $saved['method'] ?? 'app' );
		return $saved;
	}

	/**
	 * Exchanges the code from the callback for credentials.
	 *
	 * @param AbstractNetwork $network Network of the session.
	 * @param array           $session From take().
	 * @param string          $code    Code from the callback URL: the network's code for 'app',
	 *                                 the handoff code for 'broker'.
	 * @return array Credentials.
	 * @throws NetworkException When the network or the server refuses the code.
	 */
	public static function exchange( AbstractNetwork $network, array $session, string $code ): array {
		if ( 'broker' === $session['method'] ) {
			return $network->complete_credentials( Broker::claim( $code ) );
		}
		$app = Accounts::app( $network->key() );
		if ( ! empty( $session['verifier'] ) ) {
			$app['code_verifier'] = (string) $session['verifier'];
		}
		return $network->exchange_code( $app, $code, OAuth::redirect_uri() );
	}
}
