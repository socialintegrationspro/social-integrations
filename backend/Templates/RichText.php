<?php
/**
 * Text styles in captions: {b}bold{/b}, {i}italic{/i}, {u}underline{/u}, {s}strikethrough{/s}, {m}monospace{/m}.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Templates;

defined( 'ABSPATH' ) || exit;

/**
 * Reads the style marks of a caption and converts them for a network: Unicode letters for most
 * networks, Markdown or HTML for the networks that show real styles.
 *
 * A mark ends at the end of its line. A mark in double braces, such as {{b}}, is text. Links,
 * hashtags and mentions keep their letters, so they still work on the network.
 */
final class RichText {

	/**
	 * Style marks, in the order that they nest.
	 */
	const MARKS = array( 'b', 'i', 'u', 's', 'm' );

	/**
	 * A mark, a closing mark, or a mark in double braces.
	 */
	const PATTERN = '/\{\{(\/?[biusm])\}\}|\{(\/?)([biusm])\}/';

	/**
	 * Text that keeps its letters: links, hashtags and mentions.
	 */
	const KEEP = '~(https?://\S+|www\.\S+|#[\p{L}\p{N}_]+|@[\w.\-]+(?:@[\w.\-]+)?)~u';

	/**
	 * Whether a text has a style mark.
	 *
	 * @param string $text Text.
	 */
	public static function has_marks( string $text ): bool {
		return (bool) preg_match( '/(?<!\{)\{\/?[biusm]\}(?!\})/', $text );
	}

	/**
	 * The text as runs: each run is text with one set of marks. A line break is a run of its own.
	 *
	 * @param string $text Text with marks.
	 * @return array<int, array{text: string, marks: string[]}>
	 */
	public static function parse( string $text ): array {
		$runs = array();
		foreach ( preg_split( '/(\n)/', $text, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY ) as $line ) {
			if ( "\n" === $line ) {
				$runs[] = array(
					'text'  => "\n",
					'marks' => array(),
				);
				continue;
			}
			$open = array();
			$at   = 0;
			preg_match_all( self::PATTERN, $line, $found, PREG_SET_ORDER | PREG_OFFSET_CAPTURE );
			foreach ( $found as $m ) {
				self::add( $runs, substr( $line, $at, $m[0][1] - $at ), $open );
				$at = $m[0][1] + strlen( $m[0][0] );
				if ( isset( $m[1] ) && '' !== $m[1][0] && -1 !== $m[1][1] ) {
					self::add( $runs, '{' . $m[1][0] . '}', $open );
				} elseif ( '/' === $m[2][0] ) {
					$open = array_values( array_diff( $open, array( $m[3][0] ) ) );
				} elseif ( ! in_array( $m[3][0], $open, true ) ) {
					$open[] = $m[3][0];
				}
			}
			self::add( $runs, substr( $line, $at ), $open );
		}
		return $runs;
	}

	/**
	 * Adds text to the runs, joined to the last run when it has the same marks.
	 *
	 * @param array  $runs  Runs, by reference.
	 * @param string $text  Text.
	 * @param array  $marks Open marks.
	 */
	private static function add( array &$runs, string $text, array $marks ): void {
		if ( '' === $text ) {
			return;
		}
		$marks = array_values( array_intersect( self::MARKS, $marks ) );
		$last  = count( $runs ) - 1;
		if ( $last >= 0 && "\n" !== $runs[ $last ]['text'] && $runs[ $last ]['marks'] === $marks ) {
			$runs[ $last ]['text'] .= $text;
			return;
		}
		$runs[] = array(
			'text'  => $text,
			'marks' => $marks,
		);
	}

	/**
	 * The text without marks, as a person reads it.
	 *
	 * @param string $text Text with marks.
	 */
	public static function plain( string $text ): string {
		return implode( '', array_column( self::parse( $text ), 'text' ) );
	}

	/**
	 * Runs as text with marks again.
	 *
	 * @param array $runs Runs.
	 */
	public static function join( array $runs ): string {
		$out = '';
		foreach ( $runs as $run ) {
			$text = (string) preg_replace( '/\{(\/?[biusm])\}/', '{{$1}}', $run['text'] );
			foreach ( $run['marks'] as $mark ) {
				$text = '{' . $mark . '}' . $text;
			}
			foreach ( array_reverse( $run['marks'] ) as $mark ) {
				$text .= '{/' . $mark . '}';
			}
			$out .= $text;
		}
		return $out;
	}

	/**
	 * Cuts a text with marks so that a person reads at most a number of characters. The marks stay in pairs.
	 *
	 * @param string $text  Text with marks.
	 * @param int    $limit Number of characters, the "…" included.
	 */
	public static function fit( string $text, int $limit ): string {
		if ( mb_strlen( self::plain( $text ) ) <= $limit ) {
			return $text;
		}
		$room = max( 1, $limit - 1 );
		$kept = array();
		foreach ( self::parse( $text ) as $run ) {
			$length = mb_strlen( $run['text'] );
			if ( $length >= $room ) {
				$run['text'] = rtrim( mb_substr( $run['text'], 0, $room ) ) . '…';
				$kept[]      = $run;
				break;
			}
			$kept[] = $run;
			$room  -= $length;
		}
		return self::join( $kept );
	}

	/**
	 * Unicode letters for the styles, for networks that show plain text only.
	 *
	 * @param string $text Text with marks.
	 */
	public static function to_unicode( string $text ): string {
		$out = '';
		foreach ( self::parse( $text ) as $run ) {
			if ( ! $run['marks'] ) {
				$out .= $run['text'];
				continue;
			}
			foreach ( preg_split( self::KEEP, $run['text'], -1, PREG_SPLIT_DELIM_CAPTURE ) as $i => $part ) {
				$out .= 1 === $i % 2 ? $part : self::letters( $part, $run['marks'] );
			}
		}
		return $out;
	}

	/**
	 * Letters in a Unicode style, plus combining lines for underline and strikethrough.
	 *
	 * @param string   $text  Text.
	 * @param string[] $marks Marks.
	 */
	private static function letters( string $text, array $marks ): string {
		$bold   = in_array( 'b', $marks, true );
		$italic = in_array( 'i', $marks, true );
		// Sans-serif letters: these blocks have every letter, with no gaps.
		if ( in_array( 'm', $marks, true ) ) {
			$base = array( 0x1D670, 0x1D68A, 0x1D7F6 );
		} elseif ( $bold && $italic ) {
			$base = array( 0x1D63C, 0x1D656, 0x1D7EC );
		} elseif ( $bold ) {
			$base = array( 0x1D5D4, 0x1D5EE, 0x1D7EC );
		} elseif ( $italic ) {
			$base = array( 0x1D608, 0x1D622, 0 );
		} else {
			$base = array( 0, 0, 0 );
		}
		$line = ( in_array( 'u', $marks, true ) ? "\u{0332}" : '' ) . ( in_array( 's', $marks, true ) ? "\u{0336}" : '' );
		$out  = '';
		foreach ( preg_split( '//u', $text, -1, PREG_SPLIT_NO_EMPTY ) as $char ) {
			$code = mb_ord( $char );
			if ( $code >= 65 && $code <= 90 && $base[0] ) {
				$char = mb_chr( $base[0] + $code - 65 );
			} elseif ( $code >= 97 && $code <= 122 && $base[1] ) {
				$char = mb_chr( $base[1] + $code - 97 );
			} elseif ( $code >= 48 && $code <= 57 && $base[2] ) {
				$char = mb_chr( $base[2] + $code - 48 );
			}
			$out .= $char . ( '' !== $line && ! preg_match( '/\s/u', $char ) ? $line : '' );
		}
		return $out;
	}

	/**
	 * Markdown for the styles, as Discord and Reddit show it.
	 *
	 * @param string $text      Text with marks.
	 * @param bool   $underline Whether the network has underline (__text__). Reddit does not.
	 */
	public static function to_markdown( string $text, bool $underline = true ): string {
		$pairs = array(
			'b' => '**',
			'i' => '*',
			'u' => $underline ? '__' : '',
			's' => '~~',
			'm' => '`',
		);
		$out   = '';
		foreach ( self::parse( $text ) as $run ) {
			$marks = in_array( 'm', $run['marks'], true ) ? array( 'm' ) : $run['marks'];
			// Markdown does not allow a space just inside a marker, so spaces go outside.
			preg_match( '/^(\s*)(.*?)(\s*)$/su', $run['text'], $m );
			$body = $m[2];
			if ( '' === $body ) {
				$out .= $run['text'];
				continue;
			}
			foreach ( array_reverse( $marks ) as $mark ) {
				$body = $pairs[ $mark ] . $body . $pairs[ $mark ];
			}
			$out .= $m[1] . $body . $m[3];
		}
		return $out;
	}

	/**
	 * Telegram HTML for the styles. All text is escaped.
	 *
	 * @param string $text Text with marks.
	 */
	public static function to_html( string $text ): string {
		$tags = array(
			'b' => 'b',
			'i' => 'i',
			'u' => 'u',
			's' => 's',
			'm' => 'code',
		);
		$out  = '';
		foreach ( self::parse( $text ) as $run ) {
			$body = htmlspecialchars( $run['text'], ENT_NOQUOTES, 'UTF-8' );
			foreach ( array_reverse( $run['marks'] ) as $mark ) {
				$body = '<' . $tags[ $mark ] . '>' . $body . '</' . $tags[ $mark ] . '>';
			}
			$out .= $body;
		}
		return $out;
	}
}
