<?php
/**
 * Sign-in flows for OAuth networks.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Auth;

use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Networks\AbstractNetwork;
use SocialIntegrations\Networks\NetworkException;
use SocialIntegrations\Networks\Registry;
use SocialIntegrations\Support\Encryption;

defined( 'ABSPATH' ) || exit;

/**
 * Runs "Connect with…" for networks whose auth_type() is 'oauth2'.
 *
 * 1. The admin app calls POST /oauth/{network}/start and sends the user to the URL it returns.
 * 2. The network sends the user back to /social-integrations/oauth/callback
 *    (or /?sint_oauth_callback=1 without pretty permalinks). The callback URL is the
 *    same for every network, so it can be registered exactly in the network app; the
 *    network key travels in the state. The logged-in cookie identifies the user.
 *    admin-post.php?action=sint_oauth_callback still works for apps registered with it.
 * 3. When the sign-in can post as several things (Facebook Pages), the choices are
 *    kept for a short time and the admin app lets the user pick one through
 *    GET/POST /oauth/{network}/entities. Otherwise the account is saved right away.
 */
final class OAuth {

	const REST_NAMESPACE  = 'sint/v1';
	const ACTION          = 'sint_oauth_callback';
	const QUERY_VAR       = 'sint_oauth_callback';
	const CALLBACK_PATH   = 'social-integrations/oauth/callback';
	const STATE_PREFIX    = 'sint_oauth_state_';
	const PENDING_PREFIX  = 'sint_oauth_pending_';
	const STATE_TTL       = 10 * MINUTE_IN_SECONDS;
	const PENDING_TTL     = 15 * MINUTE_IN_SECONDS;
	const NETWORK_PATTERN = '(?P<network>[a-z0-9_-]+)';

	/**
	 * Network registry.
	 *
	 * @var Registry
	 */
	private $registry;

	/**
	 * Constructor.
	 *
	 * @param Registry $registry Network registry.
	 */
	public function __construct( Registry $registry ) {
		$this->registry = $registry;
	}

	/**
	 * Hooks the REST routes and the callback.
	 */
	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'admin_post_' . self::ACTION, array( $this, 'handle_callback' ) );
		add_action( 'init', array( self::class, 'add_rewrite_rule' ) );
		add_filter( 'query_vars', array( $this, 'add_query_var' ) );
		add_action( 'parse_request', array( $this, 'maybe_handle_callback' ) );
	}

	/**
	 * Callback URL to register in the network app.
	 */
	public static function redirect_uri(): string {
		global $wp_rewrite;
		if ( get_option( 'permalink_structure' ) ) {
			// "/index.php/%postname%/" structures are for servers without URL rewriting.
			$prefix = $wp_rewrite instanceof \WP_Rewrite && $wp_rewrite->using_index_permalinks() ? '/' . $wp_rewrite->index : '';
			return home_url( $prefix . '/' . self::CALLBACK_PATH );
		}
		return add_query_arg( self::QUERY_VAR, '1', home_url( '/' ) );
	}

	/**
	 * Maps /social-integrations/oauth/callback to the callback. Flushes the rules once
	 * when they do not hold it yet, for example right after an update.
	 */
	public static function add_rewrite_rule(): void {
		$regex = '^' . self::CALLBACK_PATH . '/?$';
		add_rewrite_rule( $regex, 'index.php?' . self::QUERY_VAR . '=1', 'top' );

		$rules = get_option( 'rewrite_rules' );
		if ( get_option( 'permalink_structure' ) && is_array( $rules ) && ! isset( $rules[ $regex ] ) ) {
			flush_rewrite_rules( false );
		}
	}

	/**
	 * Lets WordPress read the callback query var.
	 *
	 * @param string[] $vars Public query vars.
	 */
	public function add_query_var( array $vars ): array {
		$vars[] = self::QUERY_VAR;
		return $vars;
	}

	/**
	 * Runs the callback before WordPress loads a template.
	 *
	 * @param \WP $wp Current request.
	 */
	public function maybe_handle_callback( \WP $wp ): void {
		if ( ! empty( $wp->query_vars[ self::QUERY_VAR ] ) ) {
			$this->handle_callback();
		}
	}

	/**
	 * Registers the REST routes.
	 */
	public function register_routes(): void {
		$network_arg = array(
			'network' => array(
				'type'              => 'string',
				'required'          => true,
				'sanitize_callback' => 'sanitize_key',
			),
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/oauth/' . self::NETWORK_PATTERN . '/start',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'start' ),
				'permission_callback' => array( $this, 'can_manage' ),
				'args'                => $network_arg,
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/oauth/' . self::NETWORK_PATTERN . '/entities',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'list_entities' ),
					'permission_callback' => array( $this, 'can_manage' ),
					'args'                => $network_arg,
				),
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'pick_entity' ),
					'permission_callback' => array( $this, 'can_manage' ),
					'args'                => $network_arg + array(
						'remote_id' => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => 'sanitize_text_field',
						),
					),
				),
			)
		);
	}

	/**
	 * Whether the current user may connect accounts.
	 */
	public function can_manage(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * POST /oauth/{network}/start — returns the network's sign-in URL.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function start( \WP_REST_Request $request ) {
		$network = $this->oauth_network( (string) $request['network'] );
		if ( is_wp_error( $network ) ) {
			return $network;
		}
		if ( ! Accounts::has_app( $network->key() ) ) {
			return new \WP_Error(
				'sint_no_app',
				/* translators: %s: network name */
				sprintf( __( 'Enter the app ID and secret of your %s app first.', 'social-integrations' ), $network->label() ),
				array( 'status' => 400 )
			);
		}

		$state = wp_generate_password( 40, false, false );
		set_transient(
			self::STATE_PREFIX . $state,
			array(
				'user_id' => get_current_user_id(),
				'network' => $network->key(),
			),
			self::STATE_TTL
		);

		$url = $network->authorization_url( Accounts::app( $network->key() ), self::redirect_uri(), $state );
		if ( '' === $url ) {
			delete_transient( self::STATE_PREFIX . $state );
			return new \WP_Error( 'sint_no_url', __( 'This network did not provide a sign-in address.', 'social-integrations' ), array( 'status' => 500 ) );
		}

		return rest_ensure_response( array( 'url' => $url ) );
	}

	/**
	 * GET /oauth/{network}/entities — choices waiting to be picked, without credentials.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function list_entities( \WP_REST_Request $request ) {
		$key     = sanitize_key( (string) $request['network'] );
		$pending = $this->pending( $key );
		if ( null === $pending ) {
			return new \WP_Error( 'sint_no_pending', __( 'The sign-in has expired. Connect again.', 'social-integrations' ), array( 'status' => 404 ) );
		}

		$entities = array();
		foreach ( $pending as $entity ) {
			$entities[] = array(
				'remote_id' => (string) $entity['remote_id'],
				'name'      => (string) $entity['name'],
				'avatar'    => (string) $entity['avatar'],
			);
		}
		return rest_ensure_response( $entities );
	}

	/**
	 * POST /oauth/{network}/entities — saves the picked choice as the account.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function pick_entity( \WP_REST_Request $request ) {
		$key       = sanitize_key( (string) $request['network'] );
		$remote_id = (string) $request['remote_id'];
		$pending   = $this->pending( $key );
		if ( null === $pending ) {
			return new \WP_Error( 'sint_no_pending', __( 'The sign-in has expired. Connect again.', 'social-integrations' ), array( 'status' => 404 ) );
		}

		foreach ( $pending as $entity ) {
			if ( (string) $entity['remote_id'] !== $remote_id ) {
				continue;
			}
			$credentials = json_decode( Encryption::decrypt( (string) $entity['credentials'] ), true );
			if ( ! is_array( $credentials ) || empty( $credentials ) ) {
				return new \WP_Error( 'sint_bad_pending', __( 'The sign-in could not be read. Connect again.', 'social-integrations' ), array( 'status' => 400 ) );
			}

			$account = Accounts::save(
				$key,
				array(
					'remote_id'   => $entity['remote_id'],
					'name'        => $entity['name'],
					'username'    => $entity['username'],
					'avatar'      => $entity['avatar'],
					'profile_url' => $entity['profile_url'],
				),
				$credentials
			);
			delete_transient( $this->pending_key( $key ) );
			return rest_ensure_response( $account );
		}

		return new \WP_Error( 'sint_unknown_entity', __( 'That choice is not part of this sign-in.', 'social-integrations' ), array( 'status' => 400 ) );
	}

	/**
	 * The sign-in callback — finishes the sign-in and returns to the admin app.
	 * Always ends with a redirect and exit.
	 */
	public function handle_callback(): void {
		// The state checked below protects this request, not a nonce.
		// phpcs:disable WordPress.Security.NonceVerification.Recommended
		$state = isset( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : '';
		$code  = isset( $_GET['code'] ) ? sanitize_text_field( wp_unslash( $_GET['code'] ) ) : '';
		$error = '';
		if ( isset( $_GET['error_description'] ) ) {
			$error = sanitize_text_field( wp_unslash( $_GET['error_description'] ) );
		} elseif ( isset( $_GET['error'] ) ) {
			$error = sanitize_text_field( wp_unslash( $_GET['error'] ) );
		}
		// phpcs:enable WordPress.Security.NonceVerification.Recommended

		if ( ! current_user_can( 'manage_options' ) ) {
			$this->finish( 'error', __( 'You are not allowed to connect accounts.', 'social-integrations' ) );
		}

		$saved = '' !== $state ? get_transient( self::STATE_PREFIX . $state ) : false;
		if ( '' !== $state ) {
			delete_transient( self::STATE_PREFIX . $state );
		}
		if ( ! is_array( $saved ) || (int) ( $saved['user_id'] ?? 0 ) !== get_current_user_id() ) {
			$this->finish( 'error', __( 'The sign-in could not be verified or took too long. Connect again.', 'social-integrations' ) );
		}

		$network = $this->oauth_network( (string) ( $saved['network'] ?? '' ) );
		if ( is_wp_error( $network ) ) {
			$this->finish( 'error', $network->get_error_message() );
		}
		$key = $network->key();

		if ( '' !== $error || '' === $code ) {
			$message = '' !== $error
				/* translators: 1: network name, 2: reason from the network */
				? sprintf( __( '%1$s sign-in was cancelled or refused: %2$s', 'social-integrations' ), $network->label(), $error )
				/* translators: %s: network name */
				: sprintf( __( '%s did not return a sign-in code. Connect again.', 'social-integrations' ), $network->label() );
			$this->finish( 'error', $message );
		}

		try {
			$credentials = $network->exchange_code( Accounts::app( $key ), $code, self::redirect_uri() );
			$entities    = $network->connectable_entities( $credentials );

			if ( is_array( $entities ) ) {
				$stored = array();
				foreach ( $entities as $entity ) {
					if ( empty( $entity['remote_id'] ) || empty( $entity['credentials'] ) || ! is_array( $entity['credentials'] ) ) {
						continue;
					}
					$stored[] = array(
						'remote_id'   => sanitize_text_field( (string) $entity['remote_id'] ),
						'name'        => sanitize_text_field( (string) ( $entity['name'] ?? '' ) ),
						'username'    => sanitize_text_field( (string) ( $entity['username'] ?? '' ) ),
						'avatar'      => esc_url_raw( (string) ( $entity['avatar'] ?? '' ) ),
						'profile_url' => esc_url_raw( (string) ( $entity['profile_url'] ?? '' ) ),
						'credentials' => Encryption::encrypt( (string) wp_json_encode( $entity['credentials'] ) ),
					);
				}
				if ( empty( $stored ) ) {
					/* translators: %s: network name */
					$this->finish( 'error', sprintf( __( 'This %s sign-in has nothing it can post to. Check that you manage a Page and granted access to it.', 'social-integrations' ), $network->label() ) );
				}
				set_transient( $this->pending_key( $key ), $stored, self::PENDING_TTL );
				$this->finish( 'pick', $key );
			}

			$profile = $network->fetch_profile( $credentials );
			if ( empty( $profile['remote_id'] ) ) {
				/* translators: %s: network name */
				$this->finish( 'error', sprintf( __( '%s did not return the account profile. Connect again.', 'social-integrations' ), $network->label() ) );
			}
			Accounts::save( $key, $profile, $credentials );
		} catch ( NetworkException $e ) {
			$this->finish( 'error', $e->getMessage() );
		}

		$this->finish( 'connected', $key );
	}

	/**
	 * Redirects to the accounts screen of the admin app and stops.
	 *
	 * @param string $param 'connected', 'pick' or 'error'.
	 * @param string $value Network key, or the error message.
	 */
	private function finish( string $param, string $value ): void {
		wp_safe_redirect( admin_url( 'admin.php?page=social-integrations#/accounts?' . $param . '=' . rawurlencode( $value ) ) );
		exit;
	}

	/**
	 * The OAuth network for a key, or an error.
	 *
	 * @param string $key Network key.
	 * @return AbstractNetwork|\WP_Error
	 */
	private function oauth_network( string $key ) {
		$network = $this->registry->get( sanitize_key( $key ) );
		if ( null === $network || 'oauth2' !== $network->auth_type() ) {
			return new \WP_Error( 'sint_unknown_network', __( 'This network does not connect with sign-in.', 'social-integrations' ), array( 'status' => 404 ) );
		}
		return $network;
	}

	/**
	 * Pending choices for the current user, or null.
	 *
	 * @param string $key Network key.
	 * @return array[]|null
	 */
	private function pending( string $key ): ?array {
		$pending = get_transient( $this->pending_key( $key ) );
		return is_array( $pending ) && ! empty( $pending ) ? $pending : null;
	}

	/**
	 * Transient key for pending choices, bound to the current user.
	 *
	 * @param string $key Network key.
	 */
	private function pending_key( string $key ): string {
		return self::PENDING_PREFIX . get_current_user_id() . '_' . sanitize_key( $key );
	}
}
