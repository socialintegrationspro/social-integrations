<?php
/**
 * Error from a network.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

defined( 'ABSPATH' ) || exit;

/**
 * Carries a machine code ('expired', 'http_403', ...) and a message a person can act on.
 */
class NetworkException extends \RuntimeException {

	/**
	 * Machine code.
	 *
	 * @var string
	 */
	private $error_code;

	/**
	 * Constructor.
	 *
	 * @param string $error_code Machine code.
	 * @param string $message    Human message.
	 * @param int    $status     HTTP status, if any.
	 */
	public function __construct( string $error_code, string $message, int $status = 0 ) {
		parent::__construct( $message, $status );
		$this->error_code = $error_code;
	}

	/**
	 * Machine code.
	 */
	public function error_code(): string {
		return $this->error_code;
	}

	/**
	 * Whether the account must sign in again.
	 */
	public function is_expired(): bool {
		return 'expired' === $this->error_code;
	}
}
