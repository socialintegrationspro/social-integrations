<?php
/**
 * Encryption for stored tokens and API keys.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Support;

defined( 'ABSPATH' ) || exit;

/**
 * Encrypts secrets with libsodium (bundled with PHP 7.2+ and polyfilled by WordPress).
 * The key comes from the site's salts, so a database copy alone cannot read the secrets.
 */
final class Encryption {

	const PREFIX = 'sint1:';

	/**
	 * Encrypts a string.
	 *
	 * @param string $plain Plain text.
	 */
	public static function encrypt( string $plain ): string {
		if ( '' === $plain ) {
			return '';
		}
		$nonce  = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		$cipher = sodium_crypto_secretbox( $plain, $nonce, self::key() );
		return self::PREFIX . base64_encode( $nonce . $cipher ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
	}

	/**
	 * Decrypts a string made by encrypt(). Returns '' when it cannot.
	 *
	 * @param string $stored Stored value.
	 */
	public static function decrypt( string $stored ): string {
		if ( 0 !== strpos( $stored, self::PREFIX ) ) {
			return '';
		}
		$raw = base64_decode( substr( $stored, strlen( self::PREFIX ) ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		if ( false === $raw || strlen( $raw ) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ) {
			return '';
		}
		$nonce  = substr( $raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		$cipher = substr( $raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		$plain  = sodium_crypto_secretbox_open( $cipher, $nonce, self::key() );
		return false === $plain ? '' : $plain;
	}

	/**
	 * Encrypts every string value of an array.
	 *
	 * @param array $values Values.
	 */
	public static function encrypt_array( array $values ): array {
		return array_map(
			static function ( $value ) {
				return is_string( $value ) ? self::encrypt( $value ) : $value;
			},
			$values
		);
	}

	/**
	 * Decrypts every string value of an array.
	 *
	 * @param array $values Values.
	 */
	public static function decrypt_array( array $values ): array {
		return array_map(
			static function ( $value ) {
				return is_string( $value ) ? self::decrypt( $value ) : $value;
			},
			$values
		);
	}

	/**
	 * A 32-byte key derived from the site's salts.
	 */
	private static function key(): string {
		return hash( 'sha256', wp_salt( 'auth' ) . wp_salt( 'secure_auth' ) . 'social-integrations', true );
	}
}
