<?php
/**
 * Base class for a social network.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

use SocialIntegrations\Support\Redact;

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
	 * Most requests kept in one trace.
	 */
	const TRACE_MAX = 10;

	/**
	 * Largest image that fetch_image() downloads, in bytes.
	 */
	const MAX_IMAGE = 15 * MB_IN_BYTES;

	/**
	 * Requests since the last take_trace(), without secrets, for the share log.
	 *
	 * @var array[]
	 */
	private $trace = array();

	/**
	 * Returns the requests made since the last call, and starts a new trace. Each request:
	 * [ 'method', 'url', 'status' (0 on a transport error), 'ms', 'response', 'error'? ].
	 */
	public function take_trace(): array {
		$trace       = $this->trace;
		$this->trace = array();
		return $trace;
	}

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
	 * How many characters a link counts toward char_limit(). 0 counts it as typed.
	 */
	public function url_length(): int {
		return 0;
	}

	/**
	 * Whether the sign-in uses PKCE. When true, the sign-in adds a S256 code challenge
	 * to the authorization_url() address and passes the verifier to exchange_code()
	 * as $app['code_verifier'].
	 */
	public function pkce(): bool {
		return false;
	}

	/**
	 * Link to the network's page where the user creates an app.
	 */
	public function app_setup_url(): string {
		return '';
	}

	// Defaults that networks override. Each keeps the full signature, so the parameters
	// are not used here.
	// phpcs:disable Generic.CodeAnalysis.UnusedFunctionParameter,Squiz.Commenting.FunctionComment.InvalidNoReturn

	/**
	 * Checks the fields from connect_fields() and returns the account.
	 *
	 * @param array $input Field values.
	 * @return array ['credentials' => array, 'profile' => array].
	 * @throws NetworkException When the values do not work.
	 */
	public function authenticate( array $input ): array {
		throw new NetworkException( 'unsupported', esc_html__( 'This network connects with sign-in.', 'social-integrations' ) );
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
		throw new NetworkException( 'unsupported', esc_html__( 'This network does not use sign-in.', 'social-integrations' ) );
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

	// phpcs:enable

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
			'url_length'     => $this->url_length(),
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

		$start    = microtime( true );
		$response = wp_remote_request( $url, $args );
		$step     = array(
			'method' => $method,
			'url'    => Redact::url( $url ),
			'ms'     => (int) round( ( microtime( true ) - $start ) * 1000 ),
		);
		if ( is_wp_error( $response ) ) {
			$this->trace(
				$step + array(
					'status' => 0,
					'error'  => $response->get_error_code() . ': ' . $response->get_error_message(),
				)
			);
			throw new NetworkException( 'http', esc_html( $response->get_error_message() ) );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = (string) wp_remote_retrieve_body( $response );
		$this->trace(
			$step + array(
				'status'   => $code,
				'response' => Redact::body( $raw ),
			)
		);
		$body = json_decode( $raw, true );
		$body = is_array( $body ) ? $body : array();

		if ( $code >= 400 ) {
			// Only the message is shown. The error code and the status are data for the log; the trace keeps the body.
			throw new NetworkException( $this->error_code( $code, $body ), esc_html( $this->error_message( $code, $body ) ), $code ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
		}
		return $body;
	}

	/**
	 * Sends a GET request with query arguments and decodes a JSON answer.
	 *
	 * @param string $url   URL without a query string.
	 * @param array  $query Query arguments. When empty, the URL is sent as it is.
	 * @param array  $args  wp_remote_request() arguments.
	 * @return array Decoded body.
	 * @throws NetworkException On a transport error or an HTTP status of 400 or more.
	 */
	protected function http_get( string $url, array $query = array(), array $args = array() ): array {
		return $this->request( 'GET', $query ? self::build_url( $url, $query ) : $url, $args );
	}

	/**
	 * Adds query arguments to a URL. The arguments are encoded as RFC 3986.
	 *
	 * @param string $base  URL without a query string.
	 * @param array  $query Query arguments.
	 */
	protected static function build_url( string $base, array $query ): string {
		return $base . '?' . http_build_query( $query, '', '&', PHP_QUERY_RFC3986 );
	}

	/**
	 * Adds 'expires_at' (a Unix time) to the credentials when the token answer has 'expires_in'.
	 * When 'expires_in' is missing or 0, the credentials do not change.
	 *
	 * @param array $credentials Credentials.
	 * @param array $answer      Decoded token answer.
	 */
	protected function with_expiry( array $credentials, array $answer ): array {
		if ( ! empty( $answer['expires_in'] ) ) {
			$credentials['expires_at'] = time() + (int) $answer['expires_in'];
		}
		return $credentials;
	}

	/**
	 * Downloads an image from a URL in the post. wp_safe_remote_get() refuses private and
	 * local addresses, also after a redirect, so a URL in a post cannot reach the server's
	 * own network. Only an image up to MAX_IMAGE bytes is returned.
	 *
	 * @param string $url Image URL.
	 * @return array|null ['bytes', 'mime'], or null when the URL gives no usable image.
	 */
	protected function fetch_image( string $url ): ?array {
		if ( '' === $url || ! wp_http_validate_url( $url ) ) {
			return null;
		}
		$response = wp_safe_remote_get(
			$url,
			array(
				'timeout'             => 30,
				'limit_response_size' => self::MAX_IMAGE,
			)
		);
		if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
			return null;
		}
		$bytes = (string) wp_remote_retrieve_body( $response );
		$info  = '' !== $bytes && strlen( $bytes ) < self::MAX_IMAGE ? getimagesizefromstring( $bytes ) : false;
		if ( ! $info || empty( $info['mime'] ) ) {
			return null;
		}
		return array(
			'bytes' => $bytes,
			'mime'  => (string) $info['mime'],
		);
	}

	/**
	 * Image bytes, from the local file when there is one, otherwise downloaded.
	 *
	 * @param array $image ['url', 'path'].
	 * @return array ['bytes' => string, 'mime' => string].
	 * @throws NetworkException When the image cannot be read.
	 */
	protected function read_image( array $image ): array {
		$path = (string) ( $image['path'] ?? '' );
		if ( '' !== $path && is_readable( $path ) ) {
			$bytes = (string) file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$type  = wp_check_filetype( $path );
			if ( '' !== $bytes ) {
				return array(
					'bytes' => $bytes,
					'mime'  => $type['type'] ? (string) $type['type'] : 'image/jpeg',
				);
			}
		}

		$file = $this->fetch_image( (string) ( $image['url'] ?? '' ) );
		if ( $file ) {
			return $file;
		}

		/* translators: %s: network name */
		throw new NetworkException( 'media', esc_html( sprintf( __( 'An image of the post could not be read, so it was not sent to %s.', 'social-integrations' ), $this->label() ) ) );
	}

	/**
	 * Image URLs of the payload, up to max_images().
	 *
	 * @param array $payload Share payload.
	 * @return string[]
	 */
	protected function image_urls( array $payload ): array {
		$urls = array();
		foreach ( (array) ( $payload['images'] ?? array() ) as $image ) {
			if ( is_array( $image ) && ! empty( $image['url'] ) ) {
				$urls[] = (string) $image['url'];
			}
		}
		return array_slice( $urls, 0, $this->max_images() );
	}

	/**
	 * Cuts the text to char_limit(), with an ellipsis at the end when it is cut.
	 *
	 * @param string $text Text.
	 */
	protected function fit_text( string $text ): string {
		if ( mb_strlen( $text ) > $this->char_limit() ) {
			return rtrim( mb_substr( $text, 0, $this->char_limit() - 1 ) ) . '…';
		}
		return $text;
	}

	/**
	 * Adds one request to the trace.
	 *
	 * @param array $step Request summary.
	 */
	private function trace( array $step ): void {
		if ( count( $this->trace ) < self::TRACE_MAX ) {
			$this->trace[] = $step;
		}
	}

	/**
	 * Machine code for an error answer. 'expired' marks the account for reconnecting.
	 *
	 * @param int   $status HTTP status.
	 * @param array $body   Decoded body.
	 */
	protected function error_code( int $status, array $body ): string { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed -- Networks read $body.
		return 401 === $status ? 'expired' : 'http_' . $status;
	}

	/**
	 * Human message for an error answer. An 'expired' error_code() asks for a reconnect.
	 *
	 * @param int   $status HTTP status.
	 * @param array $body   Decoded body.
	 */
	protected function error_message( int $status, array $body ): string {
		if ( 'expired' === $this->error_code( $status, $body ) ) {
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
