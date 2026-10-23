<?php
/**
 * Small versions of pure WordPress functions and classes. A test that needs other
 * behavior mocks the function with Brain Monkey instead.
 *
 * @package SocialIntegrations
 */

// phpcs:ignoreFile

class WP_Post {
	public $ID           = 0;
	public $post_author  = 0;
	public $post_title   = '';
	public $post_content = '';
	public $post_excerpt = '';
	public $post_type    = 'post';
	public $post_status  = 'publish';

	public function __construct( array $props = array() ) {
		foreach ( $props as $key => $value ) {
			$this->$key = $value;
		}
	}
}

function sanitize_key( $key ) {
	return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
}

function sanitize_text_field( $str ) {
	$str = wp_strip_all_tags( (string) $str );
	return trim( preg_replace( '/[\r\n\t ]+/', ' ', $str ) );
}

function sanitize_textarea_field( $str ) {
	return trim( wp_strip_all_tags( (string) $str ) );
}

function wp_strip_all_tags( $text ) {
	$text = preg_replace( '@<(script|style)[^>]*?>.*?</\\1>@si', '', (string) $text );
	return trim( strip_tags( $text ) );
}

function wp_json_encode( $data, $options = 0 ) {
	return json_encode( $data, $options );
}

function wp_is_numeric_array( $data ) {
	return is_array( $data ) && ( array() === $data || array_keys( $data ) === range( 0, count( $data ) - 1 ) );
}

function wp_trim_words( $text, $num_words = 55, $more = '…' ) {
	$words = preg_split( '/\s+/', trim( (string) $text ), -1, PREG_SPLIT_NO_EMPTY );
	if ( count( $words ) > $num_words ) {
		return implode( ' ', array_slice( $words, 0, $num_words ) ) . $more;
	}
	return implode( ' ', $words );
}

function strip_shortcodes( $content ) {
	return preg_replace( '/\[[^\]]+\]/', '', (string) $content );
}
