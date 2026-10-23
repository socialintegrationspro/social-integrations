<?php
/**
 * The AI providers and their API keys.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\AI;

use SocialIntegrations\Hooks;
use SocialIntegrations\Support\Encryption;
use SocialIntegrations\Support\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Lists providers and keeps their API keys encrypted. Keys are never sent to the browser.
 */
final class Providers {

	const KEYS_OPTION = 'sint_ai_keys';

	/**
	 * Providers keyed by key().
	 *
	 * @return ProviderInterface[]
	 */
	public static function all(): array {
		$list = apply_filters( Hooks::AI_PROVIDERS, array( new OpenAI(), new Gemini(), new Claude() ) );
		$out  = array();
		foreach ( (array) $list as $provider ) {
			if ( $provider instanceof ProviderInterface ) {
				$out[ $provider->key() ] = $provider;
			}
		}
		return $out;
	}

	/**
	 * The provider chosen in Settings, when it is ready to write.
	 */
	public static function current(): ?ProviderInterface {
		$ai       = (array) Settings::get( 'ai', array() );
		$provider = self::all()[ (string) ( $ai['provider'] ?? '' ) ] ?? null;
		if ( ! $provider || ( $provider->needs_key() && '' === self::key( $provider->key() ) ) ) {
			return null;
		}
		return $provider;
	}

	/**
	 * Decrypted API key, or ''.
	 *
	 * @param string $provider Provider key.
	 */
	public static function key( string $provider ): string {
		$keys = get_option( self::KEYS_OPTION, array() );
		return is_array( $keys ) && ! empty( $keys[ $provider ] ) ? Encryption::decrypt( (string) $keys[ $provider ] ) : '';
	}

	/**
	 * Saves or removes API keys: a string sets one, null removes it.
	 *
	 * @param array $keys Provider key => string|null.
	 */
	public static function save_keys( array $keys ): void {
		$stored = get_option( self::KEYS_OPTION, array() );
		$stored = is_array( $stored ) ? $stored : array();
		$known  = self::all();
		foreach ( $keys as $provider => $key ) {
			$provider = sanitize_key( (string) $provider );
			if ( ! isset( $known[ $provider ] ) ) {
				continue;
			}
			if ( null === $key ) {
				unset( $stored[ $provider ] );
			} elseif ( '' !== trim( (string) $key ) ) {
				$stored[ $provider ] = Encryption::encrypt( trim( sanitize_text_field( (string) $key ) ) );
			}
		}
		update_option( self::KEYS_OPTION, $stored, false );
	}

	/**
	 * Providers as Settings lists them, with whether a key is saved.
	 */
	public static function status(): array {
		$out = array();
		foreach ( self::all() as $provider ) {
			$out[] = array(
				'key'           => $provider->key(),
				'label'         => $provider->label(),
				'needs_key'     => $provider->needs_key(),
				'has_key'       => '' !== self::key( $provider->key() ),
				'default_model' => $provider->default_model(),
			);
		}
		return $out;
	}
}
