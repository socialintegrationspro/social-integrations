<?php
/**
 * Campaign routes.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

use SocialIntegrations\Campaigns\Auto;
use SocialIntegrations\Campaigns\Campaigns;
use SocialIntegrations\Hooks;
use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Support\Capabilities;

defined( 'ABSPATH' ) || exit;

/**
 * Lists campaigns; reads and deletes any; replaces single ones; adds, updates, activates
 * and deactivates auto-post ones.
 */
final class CampaignsController extends RestController {

	/**
	 * Registers routes.
	 */
	public function register_routes(): void {
		$this->route( '/campaigns', \WP_REST_Server::READABLE, array( $this, 'index' ), array(), Capabilities::VIEW );
		$this->route( '/campaigns/(?P<id>\d+)', \WP_REST_Server::READABLE, array( $this, 'show' ), array(), Capabilities::VIEW );
		$this->route( '/campaigns/(?P<id>\d+)', \WP_REST_Server::EDITABLE, array( $this, 'update' ), array(), Capabilities::SHARE );
		$this->route( '/campaigns/(?P<id>\d+)', \WP_REST_Server::DELETABLE, array( $this, 'delete' ), array(), Capabilities::SHARE );
		$this->route( '/campaigns/auto', \WP_REST_Server::CREATABLE, array( $this, 'save_auto' ), array(), Capabilities::SHARE );
		$this->route( '/campaigns/auto/(?P<id>\d+)', \WP_REST_Server::CREATABLE, array( $this, 'save_auto' ), array(), Capabilities::SHARE );
		$this->route( '/campaigns/(?P<id>\d+)/active', \WP_REST_Server::CREATABLE, array( $this, 'set_active' ), array(), Capabilities::PUBLISH );
	}

	/**
	 * All campaigns.
	 */
	public function index(): \WP_REST_Response {
		return rest_ensure_response( Campaigns::visible_all() );
	}

	/**
	 * The campaign that the request names, when the current user can see it.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	private function campaign( \WP_REST_Request $request ) {
		$campaign = Campaigns::get( (int) $request['id'] );
		return $campaign && Campaigns::visible( $campaign ) ? $campaign : $this->not_found( __( 'This campaign does not exist.', 'social-integrations' ) );
	}

	/**
	 * One campaign, as the composer opens it.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function show( \WP_REST_Request $request ) {
		$campaign = $this->campaign( $request );
		return is_wp_error( $campaign ) ? $campaign : rest_ensure_response( $campaign );
	}

	/**
	 * Replaces a single campaign. Body: as for a new share from the composer.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update( \WP_REST_Request $request ) {
		$current = $this->campaign( $request );
		if ( is_wp_error( $current ) ) {
			return $current;
		}
		$body  = (array) $request->get_json_params();
		$error = Campaigns::check( $body );
		if ( $error ) {
			return $error;
		}
		$result = Campaigns::update( (int) $request['id'], $body );
		return $result ? rest_ensure_response( $result ) : $this->not_found( __( 'This campaign does not exist.', 'social-integrations' ) );
	}

	/**
	 * Deletes a campaign.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function delete( \WP_REST_Request $request ) {
		$current = $this->campaign( $request );
		if ( is_wp_error( $current ) ) {
			return $current;
		}
		Campaigns::delete( (int) $request['id'] );
		return rest_ensure_response( array( 'deleted' => true ) );
	}

	/**
	 * Adds or updates an auto-post campaign. Body: see Auto::clean().
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function save_auto( \WP_REST_Request $request ) {
		$body = (array) $request->get_json_params();
		if ( '' === trim( sanitize_text_field( (string) ( $body['name'] ?? '' ) ) ) ) {
			return $this->error( 'name_required', __( 'Enter a name for the campaign.', 'social-integrations' ), 400 );
		}
		if ( $request['id'] ) {
			$current = $this->campaign( $request );
			if ( is_wp_error( $current ) ) {
				return $current;
			}
		}
		$accounts = Auto::clean( $body )['accounts'];
		// An empty list shares to every account, so a user with an account limit selects accounts.
		if ( ! $accounts && null !== Accounts::allowed() ) {
			return $this->error( 'no_accounts', __( 'Select at least one account.', 'social-integrations' ), 400 );
		}
		if ( ! Accounts::can_use( $accounts ) ) {
			return Campaigns::not_allowed();
		}
		// A user who cannot publish saves the campaign off. A user who can publish turns it on.
		if ( ! current_user_can( Capabilities::PUBLISH ) ) {
			$body['active'] = false;
		}
		$campaign = Auto::save( $body, (int) $request['id'] );
		if ( ! $campaign ) {
			return $this->not_found( __( 'This campaign does not exist.', 'social-integrations' ) );
		}
		do_action( Hooks::CAMPAIGN_SAVED, (int) $campaign['id'], 'auto', ! empty( $campaign['active'] ) );
		return rest_ensure_response( $campaign );
	}

	/**
	 * Activates or deactivates an auto-post campaign. Body: { active: bool }.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function set_active( \WP_REST_Request $request ) {
		$current = $this->campaign( $request );
		if ( is_wp_error( $current ) ) {
			return $current;
		}
		$campaign = Auto::set_active( (int) $request['id'], ! empty( ( (array) $request->get_json_params() )['active'] ) );
		return $campaign ? rest_ensure_response( $campaign ) : $this->not_found( __( 'This campaign does not exist.', 'social-integrations' ) );
	}
}
