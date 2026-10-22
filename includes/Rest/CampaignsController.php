<?php
/**
 * Campaign routes.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

use SocialIntegrations\Campaigns\Auto;
use SocialIntegrations\Campaigns\Campaigns;

defined( 'ABSPATH' ) || exit;

/**
 * Lists campaigns; reads and deletes any; replaces single ones; adds, updates and turns
 * auto-post ones on or off.
 */
final class CampaignsController extends RestController {

	/**
	 * Registers routes.
	 */
	public function register_routes(): void {
		$this->route( '/campaigns', \WP_REST_Server::READABLE, array( $this, 'index' ) );
		$this->route( '/campaigns/(?P<id>\d+)', \WP_REST_Server::READABLE, array( $this, 'show' ) );
		$this->route( '/campaigns/(?P<id>\d+)', \WP_REST_Server::EDITABLE, array( $this, 'update' ) );
		$this->route( '/campaigns/(?P<id>\d+)', \WP_REST_Server::DELETABLE, array( $this, 'delete' ) );
		$this->route( '/campaigns/auto', \WP_REST_Server::CREATABLE, array( $this, 'save_auto' ) );
		$this->route( '/campaigns/auto/(?P<id>\d+)', \WP_REST_Server::CREATABLE, array( $this, 'save_auto' ) );
		$this->route( '/campaigns/(?P<id>\d+)/active', \WP_REST_Server::CREATABLE, array( $this, 'set_active' ) );
	}

	/**
	 * All campaigns.
	 */
	public function index(): \WP_REST_Response {
		return rest_ensure_response( Campaigns::all() );
	}

	/**
	 * One campaign, as the composer opens it.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function show( \WP_REST_Request $request ) {
		$campaign = Campaigns::get( (int) $request['id'] );
		return $campaign ? rest_ensure_response( $campaign ) : $this->error( 'not_found', __( 'This campaign does not exist.', 'social-integrations' ), 404 );
	}

	/**
	 * Replaces a single campaign. Body: as for a new share from the composer.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update( \WP_REST_Request $request ) {
		$body  = (array) $request->get_json_params();
		$error = Campaigns::check( $body );
		if ( $error ) {
			return $error;
		}
		$result = Campaigns::update( (int) $request['id'], $body );
		return $result ? rest_ensure_response( $result ) : $this->error( 'not_found', __( 'This campaign does not exist.', 'social-integrations' ), 404 );
	}

	/**
	 * Deletes a campaign.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public function delete( \WP_REST_Request $request ): \WP_REST_Response {
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
		$campaign = Auto::save( (array) $request->get_json_params(), (int) $request['id'] );
		return $campaign ? rest_ensure_response( $campaign ) : $this->error( 'not_found', __( 'This campaign does not exist.', 'social-integrations' ), 404 );
	}

	/**
	 * Turns an auto-post campaign on or off. Body: { active: bool }.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function set_active( \WP_REST_Request $request ) {
		$campaign = Auto::set_active( (int) $request['id'], ! empty( ( (array) $request->get_json_params() )['active'] ) );
		return $campaign ? rest_ensure_response( $campaign ) : $this->error( 'not_found', __( 'This campaign does not exist.', 'social-integrations' ), 404 );
	}
}
