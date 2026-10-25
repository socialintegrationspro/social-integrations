<?php
/**
 * Token modifiers, such as {title|upper} or {excerpt|words:20}.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Templates;

defined( 'ABSPATH' ) || exit;

/**
 * Changes the value of a token: letter case, a length limit, and a text for an empty value.
 *
 * Modifiers apply from left to right:
 * - upper, lower, title: the letter case.
 * - words:N: the first N words. A cut value ends with "…".
 * - chars:N: at most N characters, cut at a word. A cut value ends with "…".
 * - default:Text: the text when the value is empty.
 */
final class Modifiers {

	/**
	 * Names of the modifiers.
	 */
	const NAMES = array( 'upper', 'lower', 'title', 'words', 'chars', 'default' );

	/**
	 * The modifiers of a token, from the text after its name, such as '|upper|words:20'.
	 *
	 * @param string $text Modifier text.
	 * @return array<int, array{0: string, 1: string}> Name and argument of each modifier.
	 */
	public static function parse( string $text ): array {
		$mods = array();
		foreach ( explode( '|', ltrim( $text, '|' ) ) as $part ) {
			if ( '' === $part ) {
				continue;
			}
			$pair = explode( ':', $part, 2 );
			if ( in_array( $pair[0], self::NAMES, true ) ) {
				$mods[] = array( $pair[0], $pair[1] ?? '' );
			}
		}
		return $mods;
	}

	/**
	 * A value with its modifiers applied.
	 *
	 * @param string $value Value of the token.
	 * @param string $text  Modifier text, such as '|upper|words:20'.
	 */
	public static function apply( string $value, string $text ): string {
		foreach ( self::parse( $text ) as list( $name, $arg ) ) {
			switch ( $name ) {
				case 'upper':
					$value = mb_strtoupper( $value );
					break;
				case 'lower':
					$value = mb_strtolower( $value );
					break;
				case 'title':
					$value = mb_convert_case( $value, MB_CASE_TITLE );
					break;
				case 'words':
					$value = self::words( $value, max( 1, min( 1000, (int) $arg ) ) );
					break;
				case 'chars':
					$value = self::chars( $value, max( 1, min( 1000, (int) $arg ) ) );
					break;
				case 'default':
					$value = '' === trim( $value ) ? $arg : $value;
					break;
			}
		}
		return $value;
	}

	/**
	 * The first words of a text.
	 *
	 * @param string $text  Text.
	 * @param int    $count Number of words.
	 */
	private static function words( string $text, int $count ): string {
		$words = preg_split( '/\s+/u', trim( $text ), -1, PREG_SPLIT_NO_EMPTY );
		if ( ! is_array( $words ) || count( $words ) <= $count ) {
			return $text;
		}
		return rtrim( implode( ' ', array_slice( $words, 0, $count ) ), " \t,.;:" ) . '…';
	}

	/**
	 * A text cut at a word so that it has at most a number of characters, the "…" included.
	 *
	 * @param string $text  Text.
	 * @param int    $limit Number of characters.
	 */
	private static function chars( string $text, int $limit ): string {
		if ( mb_strlen( $text ) <= $limit ) {
			return $text;
		}
		$cut   = mb_substr( $text, 0, max( 1, $limit - 1 ) );
		$space = mb_strrpos( $cut, ' ' );
		if ( false !== $space && $space > 0 ) {
			$cut = mb_substr( $cut, 0, $space );
		}
		return rtrim( $cut, " \t,.;:" ) . '…';
	}
}
