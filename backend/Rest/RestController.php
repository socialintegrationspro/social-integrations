<?php
/**
 * Base REST controller.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

defined( 'ABSPATH' ) || exit;

use SocialIntegrations\Support\Capabilities;


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
	 * Registers a route. Without a permission, only a user who can change the settings can use the route.
	 *
	 * @param string               $route      Route.
	 * @param string               $methods    Methods.
	 * @param callable             $callback   Callback.
	 * @param array                $args       Argument schema.
	 * @param string|callable|null $permission A capability from Capabilities, or a permission callback.
	 */
	protected function route( string $route, string $methods, callable $callback, array $args = array(), $permission = null ): void {
		if ( null === $permission ) {
			$permission = Capabilities::MANAGE_SETTINGS;
		}
		if ( is_string( $permission ) ) {
			$cap        = $permission;
			$permission = static function () use ( $cap ): bool {
				return current_user_can( $cap );
			};
		}
		register_rest_route(
			static::NAMESPACE,
			$route,
			array(
				'methods'             => $methods,
				'callback'            => $callback,
				'permission_callback' => $permission,
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
