<?php
/**
 * Network and account routes.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

use SocialIntegrations\Auth\OAuth;
use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Networks\NetworkException;
use SocialIntegrations\Networks\Registry;

defined( 'ABSPATH' ) || exit;

/**
 * Lists networks and accounts, connects token and credential networks, and
 * saves the app fields of sign-in networks. The sign-in flow is in Auth\OAuth.
 */
final class AccountsController extends RestController {

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
	 * Registers routes.
	 */
	public function register_routes(): void {
		$this->route( '/networks', \WP_REST_Server::READABLE, array( $this, 'networks' ) );
		$this->route( '/accounts', \WP_REST_Server::READABLE, array( $this, 'accounts' ) );
		$this->route( '/accounts/(?P<network>[a-z0-9_-]+)', \WP_REST_Server::CREATABLE, array( $this, 'connect' ) );
		$this->route( '/accounts/(?P<id>[a-z0-9_-]+)', \WP_REST_Server::DELETABLE, array( $this, 'disconnect' ) );
		$this->route( '/apps/(?P<network>[a-z0-9_-]+)', \WP_REST_Server::CREATABLE, array( $this, 'save_app' ) );
	}

	/**
	 * Networks, with whether their app fields are filled in.
	 */
	public function networks(): \WP_REST_Response {
		$list = array();
		foreach ( $this->networks->all() as $network ) {
			$list[] = $network->to_array() + array( 'app_configured' => Accounts::has_app( $network->key() ) );
		}
		return rest_ensure_response(
			array(
				'networks'     => $list,
				'redirect_uri' => OAuth::redirect_uri(),
			)
		);
	}

	/**
	 * Connected accounts, without credentials.
	 */
	public function accounts(): \WP_REST_Response {
		return rest_ensure_response( Accounts::all() );
	}

	/**
	 * Connects a token or credentials network.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function connect( \WP_REST_Request $request ) {
		$network = $this->networks->get( (string) $request['network'] );
		if ( ! $network ) {
			return $this->error( 'unknown_network', __( 'This network is not available.', 'social-integrations' ), 404 );
		}
		if ( 'oauth2' === $network->auth_type() ) {
			return $this->error( 'use_sign_in', __( 'Connect this network with sign-in.', 'social-integrations' ) );
		}

		$input = array();
		foreach ( $network->connect_fields() as $field ) {
			$input[ $field['name'] ] = trim( sanitize_text_field( (string) $request->get_param( $field['name'] ) ) );
		}

		try {
			$result  = $network->authenticate( $input );
			$account = Accounts::save( $network->key(), (array) ( $result['profile'] ?? array() ), (array) ( $result['credentials'] ?? array() ) );
		} catch ( NetworkException $e ) {
			return $this->error( 'connect_failed', $e->getMessage() );
		}
		return rest_ensure_response( $account );
	}

	/**
	 * Removes an account.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function disconnect( \WP_REST_Request $request ) {
		if ( ! Accounts::delete( (string) $request['id'] ) ) {
			return $this->error( 'not_found', __( 'This account is not connected.', 'social-integrations' ), 404 );
		}
		return rest_ensure_response( array( 'deleted' => true ) );
	}

	/**
	 * Saves the app fields of a sign-in network.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function save_app( \WP_REST_Request $request ) {
		$network = $this->networks->get( (string) $request['network'] );
		if ( ! $network || 'oauth2' !== $network->auth_type() ) {
			return $this->error( 'unknown_network', __( 'This network does not use an app.', 'social-integrations' ), 404 );
		}
		$fields = array();
		foreach ( $network->app_fields() as $field ) {
			$value = trim( (string) $request->get_param( $field['name'] ) );
			if ( '' === $value ) {
				/* translators: %s: field label */
				return $this->error( 'missing_field', sprintf( __( 'Enter the %s.', 'social-integrations' ), $field['label'] ) );
			}
			$fields[ $field['name'] ] = $value;
		}
		Accounts::save_app( $network->key(), $fields );
		return rest_ensure_response( array( 'app_configured' => true ) );
	}
}
