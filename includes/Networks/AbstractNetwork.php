<?php
/**
 * Base class for a social network.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

defined( 'ABSPATH' ) || exit;

/**
 * One subclass per network. Register it through the `sint/network_classes` filter.
 *
 * Connecting is a per-network strategy:
 * - 'oauth2'      — the user creates an app on the network, enters its client ID and
 *                   secret (app_fields()), and signs in through authorization_url().
 * - 'token'       — the user pastes a token (connect_fields()), checked in authenticate().
 * - 'credentials' — the user enters a handle and an app password, checked in authenticate().
 *
 * Credentials arrays are stored encrypted and are never sent to the browser.
 */
abstract class AbstractNetwork {

	/**
	 * Unique key, for example 'facebook'.
	 */
	abstract public function key(): string;

	/**
	 * Name shown in the UI, for example 'Facebook Page'.
	 */
	abstract public function label(): string;

	/**
	 * Maximum caption length in characters.
	 */
	abstract public function char_limit(): int;

	/**
	 * Publishes one share.
	 *
	 * @param array $credentials Decrypted credentials of the account.
	 * @param array $payload     ['message' => string, 'link' => string, 'images' => [['url','alt','path']], 'videos' => [['url','path']]].
	 * @return array ['remote_id' => string, 'remote_url' => string].
	 * @throws NetworkException When the network refuses the share.
	 */
	abstract public function publish( array $credentials, array $payload ): array;

	/**
	 * Brand color, used for the network badge.
	 */
	public function color(): string {
		return '#6B7280';
	}

	/**
	 * How the account connects: 'oauth2', 'token' or 'credentials'.
	 */
	public function auth_type(): string {
		return 'oauth2';
	}

	/**
	 * Images the network accepts in one post.
	 */
	public function max_images(): int {
		return 1;
	}

	/**
	 * Whether the network accepts video.
	 */
	public function supports_video(): bool {
		return false;
	}

	/**
	 * Fields for 'token' and 'credentials' networks.
	 *
	 * @return array[] [['name' => 'bot_token', 'label' => 'Bot token', 'type' => 'password', 'help' => '...']].
	 */
	public function connect_fields(): array {
		return array();
	}

	/**
	 * Fields of the network app the user creates for 'oauth2' networks.
	 *
	 * @return array[]
	 */
	public function app_fields(): array {
		if ( 'oauth2' !== $this->auth_type() ) {
			return array();
		}
		return array(
			array(
				'name'  => 'client_id',
				'label' => __( 'App ID', 'social-integrations' ),
				'type'  => 'text',
			),
			array(
				'name'  => 'client_secret',
				'label' => __( 'App secret', 'social-integrations' ),
				'type'  => 'password',
			),
		);
	}

	/**
	 * Link to the network's page where the user creates an app.
	 */
	public function app_setup_url(): string {
		return '';
	}

	/**
	 * Checks the fields from connect_fields() and returns the account.
	 *
	 * @param array $input Field values.
	 * @return array ['credentials' => array, 'profile' => array].
	 * @throws NetworkException When the values do not work.
	 */
	public function authenticate( array $input ): array {
		throw new NetworkException( 'unsupported', __( 'This network connects with sign-in.', 'social-integrations' ) );
	}

	/**
	 * The network's sign-in URL for 'oauth2' networks.
	 *
	 * @param array  $app          Decrypted app fields.
	 * @param string $redirect_uri Callback URL.
	 * @param string $state        Anti-forgery state.
	 */
	public function authorization_url( array $app, string $redirect_uri, string $state ): string {
		return '';
	}

	/**
	 * Swaps the sign-in code for credentials.
	 *
	 * @param array  $app          Decrypted app fields.
	 * @param string $code         Code from the callback.
	 * @param string $redirect_uri Callback URL.
	 * @return array Credentials, at least ['access_token' => string].
	 * @throws NetworkException When the network refuses the code.
	 */
	public function exchange_code( array $app, string $code, string $redirect_uri ): array {
		throw new NetworkException( 'unsupported', __( 'This network does not use sign-in.', 'social-integrations' ) );
	}

	/**
	 * Gets fresh credentials before they expire. Null when the network has no refresh.
	 *
	 * @param array $app         Decrypted app fields.
	 * @param array $credentials Current credentials.
	 * @return array|null
	 */
	public function refresh( array $app, array $credentials ): ?array {
		return null;
	}

	/**
	 * Profile of the signed-in identity.
	 *
	 * @param array $credentials Credentials.
	 * @return array ['remote_id', 'name', 'username', 'avatar', 'profile_url'].
	 */
	public function fetch_profile( array $credentials ): array {
		return array();
	}

	/**
	 * Things one sign-in can post as, such as the Facebook Pages a user manages.
	 * Null when the signed-in identity is the account.
	 *
	 * @param array $credentials Credentials.
	 * @return array[]|null Each: ['remote_id', 'name', 'avatar', 'credentials' => array].
	 */
	public function connectable_entities( array $credentials ): ?array {
		return null;
	}

	/**
	 * Shape sent to the admin app. Holds no secrets.
	 */
	public function to_array(): array {
		return array(
			'key'            => $this->key(),
			'label'          => $this->label(),
			'color'          => $this->color(),
			'auth_type'      => $this->auth_type(),
			'char_limit'     => $this->char_limit(),
			'max_images'     => $this->max_images(),
			'supports_video' => $this->supports_video(),
			'connect_fields' => $this->connect_fields(),
			'app_fields'     => $this->app_fields(),
			'app_setup_url'  => $this->app_setup_url(),
		);
	}

	/**
	 * Sends an HTTP request and decodes a JSON answer.
	 *
	 * @param string $method HTTP method.
	 * @param string $url    URL.
	 * @param array  $args   wp_remote_request() arguments.
	 * @return array Decoded body.
	 * @throws NetworkException On a transport error or an HTTP status of 400 or more.
	 */
	protected function request( string $method, string $url, array $args = array() ): array {
		$args['method']  = $method;
		$args['timeout'] = $args['timeout'] ?? 30;

		$response = wp_remote_request( $url, $args );
		if ( is_wp_error( $response ) ) {
			throw new NetworkException( 'http', $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		$body = is_array( $body ) ? $body : array();

		if ( $code >= 400 ) {
			throw new NetworkException( $this->error_code( $code, $body ), $this->error_message( $code, $body ), $code, $body );
		}
		return $body;
	}

	/**
	 * Machine code for an error answer. 'expired' marks the account for reconnecting.
	 *
	 * @param int   $status HTTP status.
	 * @param array $body   Decoded body.
	 */
	protected function error_code( int $status, array $body ): string {
		return 401 === $status ? 'expired' : 'http_' . $status;
	}

	/**
	 * Human message for an error answer.
	 *
	 * @param int   $status HTTP status.
	 * @param array $body   Decoded body.
	 */
	protected function error_message( int $status, array $body ): string {
		if ( 401 === $status ) {
			/* translators: %s: network name */
			return sprintf( __( '%s sign-in expired. Reconnect the account.', 'social-integrations' ), $this->label() );
		}
		$detail = '';
		if ( isset( $body['error']['message'] ) ) {
			$detail = (string) $body['error']['message'];
		} elseif ( isset( $body['message'] ) ) {
			$detail = (string) $body['message'];
		} elseif ( isset( $body['description'] ) ) {
			$detail = (string) $body['description'];
		}
		/* translators: 1: network name, 2: reason from the network */
		return trim( sprintf( __( '%1$s did not accept the post. %2$s', 'social-integrations' ), $this->label(), $detail ) );
	}
}
