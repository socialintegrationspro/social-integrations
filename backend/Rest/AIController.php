<?php
/**
 * REST route for AI captions.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

use SocialIntegrations\Support\Capabilities;
use SocialIntegrations\Support\Errors;
use SocialIntegrations\AI\AIException;
use SocialIntegrations\AI\CaptionGenerator;

defined( 'ABSPATH' ) || exit;

/**
 * POST /ai/caption.
 */
final class AIController extends RestController {

	/**
	 * Registers routes.
	 */
	public function register_routes(): void {
		$this->route( '/ai/caption', \WP_REST_Server::CREATABLE, array( $this, 'caption' ), array(), Capabilities::SHARE );
	}

	/**
	 * Writes a caption.
	 *
	 * Body: { post_id?: int, text?: string, limit?: int, tone?: string }.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function caption( \WP_REST_Request $request ) {
		$body = (array) $request->get_json_params();
		try {
			$caption = ( new CaptionGenerator() )->write(
				array(
					'post_id' => (int) ( $body['post_id'] ?? 0 ),
					'text'    => sanitize_textarea_field( (string) ( $body['text'] ?? '' ) ),
					'limit'   => (int) ( $body['limit'] ?? 500 ),
					'tone'    => sanitize_key( (string) ( $body['tone'] ?? '' ) ),
				)
			);
		} catch ( AIException $e ) {
			return $this->error( 'ai_failed', Errors::text( $e ) );
		}
		return rest_ensure_response( array( 'caption' => $caption ) );
	}
}
