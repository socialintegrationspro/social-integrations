<?php
/**
 * Plain text of an error message.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Support;

defined( 'ABSPATH' ) || exit;

/**
 * Exception messages are escaped with esc_html() where they are thrown. The REST API and
 * the share log send plain text, and the admin app escapes it when it shows it.
 */
final class Errors {

	/**
	 * The message of an exception as plain text.
	 *
	 * @param \Throwable $e Exception.
	 */
	public static function text( \Throwable $e ): string {
		return html_entity_decode( $e->getMessage(), ENT_QUOTES, 'UTF-8' );
	}
}
