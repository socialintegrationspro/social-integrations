<?php
/**
 * Values of the post fields that networks declare.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Content;

use SocialIntegrations\Networks\AbstractNetwork;
use SocialIntegrations\Plugin;

defined( 'ABSPATH' ) || exit;

/**
 * A field map holds the values of AbstractNetwork::post_fields() for a share or a template:
 * [ '*' => [ name => value ], network key => [ name => value ] ]. The '*' values apply to
 * each network that has a SHARED field of that name. A network value replaces the '*' value.
 * A field without a value uses its default.
 */
final class PostFields {

	/**
	 * Key of the values for all networks.
	 */
	const ALL = '*';

	/**
	 * Fields that have the same meaning on each network, so one value can apply to all of them.
	 */
	const SHARED = array( 'format', 'title', 'description', 'first_comment' );

	/**
	 * Longest value or template that the plugin keeps.
	 */
	const MAX = 5000;

	/**
	 * Sanitizes a field map from a request or from storage.
	 *
	 * @param mixed $input Raw map.
	 * @return array<string, array<string, string>>
	 */
	public static function clean( $input ): array {
		$map = array();
		foreach ( (array) $input as $network => $values ) {
			$network = self::ALL === $network ? self::ALL : sanitize_key( (string) $network );
			if ( '' === $network || ! is_array( $values ) ) {
				continue;
			}
			foreach ( $values as $name => $value ) {
				$name = sanitize_key( (string) $name );
				if ( '' !== $name && ( is_scalar( $value ) || null === $value ) ) {
					$map[ $network ][ $name ] = mb_substr( sanitize_textarea_field( (string) $value ), 0, self::MAX );
				}
			}
		}
		return $map;
	}

	/**
	 * The values of a network's fields.
	 *
	 * @param AbstractNetwork $network Network.
	 * @param array           $map     Clean field map.
	 * @param callable|null   $render  Fills a template with the post's tokens. Null when the values
	 *                                 are final text, such as from the composer; then a field with
	 *                                 tokens and no value stays empty.
	 * @return array<string, string> Name => value, for each field of the network.
	 */
	public static function fill( AbstractNetwork $network, array $map, ?callable $render = null ): array {
		$key    = $network->key();
		$values = array();
		foreach ( $network->post_fields() as $field ) {
			$name   = (string) $field['name'];
			$tokens = ! empty( $field['tokens'] );
			if ( isset( $map[ $key ][ $name ] ) ) {
				$raw = $map[ $key ][ $name ];
			} elseif ( in_array( $name, self::SHARED, true ) && isset( $map[ self::ALL ][ $name ] ) ) {
				$raw = $map[ self::ALL ][ $name ];
			} else {
				$raw = $tokens && ! $render ? '' : (string) ( $field['default'] ?? '' );
			}
			if ( $tokens && $render ) {
				$raw = (string) $render( $raw );
			}
			$values[ $name ] = self::value( $field, $raw );
		}
		return $values;
	}

	/**
	 * Lays one field map over another: a value in $over replaces the value of the same
	 * network and name in $base. An empty value in $over keeps the value of $base.
	 *
	 * @param array $base Clean field map, such as a campaign's.
	 * @param array $over Clean field map, such as a post's.
	 */
	public static function merge( array $base, array $over ): array {
		foreach ( $over as $network => $values ) {
			foreach ( $values as $name => $value ) {
				if ( '' !== trim( $value ) ) {
					$base[ $network ][ $name ] = $value;
				}
			}
		}
		return $base;
	}

	/**
	 * Final values for one network from a field map that holds text, not templates, such as
	 * the composer sends. Empty when the network is not registered.
	 *
	 * @param string $network Network key.
	 * @param mixed  $map     Raw field map.
	 * @return array<string, string>
	 */
	public static function for_network( string $network, $map ): array {
		$item = Plugin::instance()->networks->get( $network );
		return $item ? self::fill( $item, self::clean( $map ) ) : array();
	}

	/**
	 * One value, checked against its field.
	 *
	 * @param array  $field Field definition.
	 * @param string $value Value.
	 */
	public static function value( array $field, string $value ): string {
		switch ( $field['type'] ?? 'text' ) {
			case 'select':
				$allowed = array_column( (array) ( $field['options'] ?? array() ), 'value' );
				return in_array( $value, $allowed, true ) ? $value : (string) ( $field['default'] ?? '' );
			case 'toggle':
				return in_array( $value, array( '1', 'true', 'yes', 'on' ), true ) ? '1' : '';
			default:
				$value = trim( $value );
				$max   = (int) ( $field['max'] ?? 0 );
				return $max > 0 && mb_strlen( $value ) > $max ? rtrim( mb_substr( $value, 0, $max - 1 ) ) . '…' : $value;
		}
	}

	/**
	 * Applies the 'format' field to a share payload: 'link' sends a link card without media,
	 * 'text' sends the caption only.
	 *
	 * @param AbstractNetwork $network Network.
	 * @param array           $payload Share payload.
	 */
	public static function apply_format( AbstractNetwork $network, array $payload ): array {
		if ( ! $network->post_field( 'format' ) ) {
			return $payload;
		}
		$format = (string) ( $payload['fields']['format'] ?? 'auto' );
		if ( 'link' === $format || 'text' === $format ) {
			$payload['images'] = array();
			$payload['videos'] = array();
		}
		if ( 'text' === $format ) {
			$payload['link'] = '';
		}
		return $payload;
	}
}
