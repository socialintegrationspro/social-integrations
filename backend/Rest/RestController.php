<?php
/**
 * Base REST controller.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

defined( 'ABSPATH' ) || exit;

/**
 * Shared namespace and permission check. WordPress checks the REST nonce through
 * the X-WP-Nonce header that the admin app sends.
 */
abstract class RestController {

	const NAMESPACE = 'sint/v1';

	/**
	 * Start of every error code.
	 */
	const ERROR_PREFIX = 'sint_';

	/**
	 * Registers the controller's routes.
	 */
	abstract public function register_routes(): void;

	/**
	 * Only administrators manage sharing.
	 */
	public function can_manage(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Registers a route with the shared permission check.
	 *
	 * @param string        $route    Route.
	 * @param string        $methods  Methods.
	 * @param callable      $callback Callback.
	 * @param array         $args     Argument schema.
	 * @param callable|null $permission Permission callback; defaults to can_manage().
	 */
	protected function route( string $route, string $methods, callable $callback, array $args = array(), ?callable $permission = null ): void {
		register_rest_route(
			static::NAMESPACE,
			$route,
			array(
				'methods'             => $methods,
				'callback'            => $callback,
				'permission_callback' => $permission ? $permission : array( $this, 'can_manage' ),
				'args'                => $args,
			)
		);
	}

	/**
	 * Error response with a message that tells a person what to do.
	 *
	 * @param string $code    Machine code.
	 * @param string $message Message.
	 * @param int    $status  HTTP status.
	 */
	protected function error( string $code, string $message, int $status = 400 ): \WP_Error {
		return new \WP_Error( static::ERROR_PREFIX . $code, $message, array( 'status' => $status ) );
	}

	/**
	 * Error response for a thing that does not exist (404).
	 *
	 * @param string $message Message.
	 */
	protected function not_found( string $message ): \WP_Error {
		return $this->error( 'not_found', $message, 404 );
	}
}
