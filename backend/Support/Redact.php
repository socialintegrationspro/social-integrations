<?php
/**
 * Removes secrets from data that the share log keeps.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Support;

defined( 'ABSPATH' ) || exit;

/**
 * The share log keeps what a network answered, so a developer can find the cause of an
 * error. The plugin replaces tokens, keys and passwords before the log stores anything.
 */
final class Redact {

	const HIDDEN = '[hidden]';

	/**
	 * Parts of a key name that mark a secret value.
	 */
	const SECRET_KEYS = '/token|secret|password|passwd|authorization|api[_-]?key|apikey|signature|cookie|session|credential|refresh|code_verifier|jwt|bearer/i';

	/**
	 * A JSON Web Token, whatever its key is called.
	 */
	const JWT = '/\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/';

	/**
	 * A URL without secret query values or a bot token in its path.
	 *
	 * @param string $url URL.
	 */
	public static function url( string $url ): string {
		// Telegram puts the bot token in the path: /bot123456:ABC.../sendMessage.
		$url = (string) preg_replace( '#/bot[0-9]+:[A-Za-z0-9_\-]+#', '/bot' . self::HIDDEN, $url );
		// A webhook URL holds its token in the path: /api/webhooks/{id}/{token}.
		$url   = (string) preg_replace( '#(/api(?:/v[0-9]+)?/webhooks/[0-9]+/)[A-Za-z0-9_\-]+#', '$1' . self::HIDDEN, $url );
		$parts = explode( '?', $url, 2 );
		if ( 2 !== count( $parts ) ) {
			return $url;
		}
		parse_str( $parts[1], $query );
		foreach ( $query as $key => $value ) {
			if ( preg_match( self::SECRET_KEYS, (string) $key ) ) {
				$query[ $key ] = self::HIDDEN;
			}
		}
		return $parts[0] . '?' . urldecode( http_build_query( $query ) );
	}

	/**
	 * Data with every secret value replaced, at any depth.
	 *
	 * @param mixed $data Decoded data.
	 * @return mixed
	 */
	public static function data( $data ) {
		if ( ! is_array( $data ) ) {
			return $data;
		}
		foreach ( $data as $key => $value ) {
			if ( is_string( $key ) && preg_match( self::SECRET_KEYS, $key ) && ! is_array( $value ) ) {
				$data[ $key ] = self::HIDDEN;
			} elseif ( is_string( $value ) ) {
				$data[ $key ] = (string) preg_replace( self::JWT, self::HIDDEN, $value );
			} else {
				$data[ $key ] = self::data( $value );
			}
		}
		return $data;
	}

	/**
	 * A text body: decoded and cleaned when it is JSON, else cut to a length.
	 *
	 * @param string $body Raw body.
	 * @param int    $max  Maximum characters kept.
	 * @return mixed
	 */
	public static function body( string $body, int $max = 4000 ) {
		$json = json_decode( $body, true );
		if ( is_array( $json ) ) {
			$clean = self::data( $json );
			$text  = (string) wp_json_encode( $clean );
			return strlen( $text ) > $max ? substr( $text, 0, $max ) . '…' : $clean;
		}
		// An HTML error page keeps only its text, on one line.
		$body = (string) preg_replace( self::JWT, self::HIDDEN, $body );
		$body = trim( (string) preg_replace( '/\s+/', ' ', html_entity_decode( wp_strip_all_tags( $body ), ENT_QUOTES, 'UTF-8' ) ) );
		return strlen( $body ) > $max ? substr( $body, 0, $max ) . '…' : $body;
	}
}
