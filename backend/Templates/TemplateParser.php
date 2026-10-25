<?php
/**
 * Caption templates.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Templates;

use SocialIntegrations\Content\CustomFields;
use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Content\Products;
use SocialIntegrations\Hooks;

defined( 'ABSPATH' ) || exit;

/**
 * Replaces {title}, {excerpt}, {url}, {tags}, {author}, {site}, {text} and
 * {field:meta_key} in a caption template. A WooCommerce product also has {price},
 * {regular_price} and {sale_price}. A token can have modifiers: {title|upper},
 * {excerpt|words:20}, {field:venue|default:Online} (see Modifiers).
 */
final class TemplateParser {

	/**
	 * Token values for a post.
	 *
	 * @param \WP_Post $post   Post.
	 * @param array    $parsed Output of BlockParser::parse().
	 * @return array<string, string>
	 */
	public function tokens( \WP_Post $post, array $parsed ): array {
		$excerpt = has_excerpt( $post ) ? get_the_excerpt( $post ) : (string) ( $parsed['excerpt'] ?? '' );
		$tokens  = array(
			'title'   => PostTypes::title( $post ),
			'excerpt' => html_entity_decode( wp_strip_all_tags( $excerpt ), ENT_QUOTES, 'UTF-8' ),
			'url'     => (string) get_permalink( $post ),
			'tags'    => $this->hashtags( $post ),
			'author'  => get_the_author_meta( 'display_name', (int) $post->post_author ),
			'site'    => html_entity_decode( get_bloginfo( 'name' ), ENT_QUOTES, 'UTF-8' ),
			'text'    => (string) ( $parsed['text'] ?? '' ),
		) + Products::tokens( $post );
		return apply_filters( Hooks::TEMPLATE_TOKENS, $tokens, $post );
	}

	/**
	 * A token in a template: {name}, {field:key}, each with modifiers such as |upper or |words:20.
	 * A token in double braces, such as {{title}}, is text: the caption shows "{title}".
	 */
	const TOKEN = '/\{\{((?:field:)?[A-Za-z0-9_\-]+(?:\|[^{}\n]*)?)\}\}|\{(field:[A-Za-z0-9_\-]+|[A-Za-z0-9_]+)((?:\|[a-z]+(?::[^{}|\n]{0,200})?)*)\}/';

	/**
	 * Fills a template in one pass, so a value that holds a token, such as an excerpt with
	 * "{url}", is not filled again. An unknown token stays as text.
	 *
	 * @param string   $template Template.
	 * @param \WP_Post $post     Post.
	 * @param array    $tokens   Token values.
	 */
	public function render( string $template, \WP_Post $post, array $tokens ): string {
		$output = preg_replace_callback(
			self::TOKEN,
			static function ( $m ) use ( $post, $tokens ) {
				if ( '' !== $m[1] ) {
					// A style mark in double braces, such as {{b}}, is for RichText to read.
					return preg_match( '/^[biusm]$/', $m[1] ) ? $m[0] : '{' . $m[1] . '}';
				}
				$name = $m[2];
				if ( 0 === strpos( $name, 'field:' ) ) {
					$value = CustomFields::value( $post, substr( $name, 6 ) );
				} elseif ( array_key_exists( $name, $tokens ) ) {
					$value = (string) $tokens[ $name ];
				} else {
					return $m[0];
				}
				// A value cannot add a style: a mark in it, such as a title "{b}", stays text.
				return (string) preg_replace( '/\{(\/?[biusm])\}/', '{{$1}}', Modifiers::apply( $value, $m[3] ?? '' ) );
			},
			$template
		);
		// A filter can add a token with a name that the pattern does not match, such as 'event-date'.
		foreach ( $tokens as $key => $value ) {
			if ( ! preg_match( '/^[A-Za-z0-9_]+$/', (string) $key ) ) {
				$output = str_replace( '{' . $key . '}', (string) $value, (string) $output );
			}
		}
		// Lines that held only an empty token disappear.
		$output = preg_replace( "/\n{3,}/", "\n\n", (string) $output );
		return trim( (string) $output );
	}

	/**
	 * The tags of the post as hashtags: post tags, product tags, or the tags of a custom post type.
	 *
	 * A tag is a term of a public taxonomy without levels, such as post_tag or product_tag.
	 * Categories have levels, so they are not hashtags.
	 *
	 * @param \WP_Post $post Post.
	 */
	private function hashtags( \WP_Post $post ): string {
		$terms = array();
		foreach ( get_object_taxonomies( $post->post_type, 'objects' ) as $taxonomy ) {
			if ( $taxonomy->hierarchical || ! $taxonomy->public || 'post_format' === $taxonomy->name ) {
				continue;
			}
			$found = get_the_terms( $post, $taxonomy->name );
			if ( is_array( $found ) ) {
				$terms = array_merge( $terms, $found );
			}
		}
		$tags = array();
		foreach ( $terms as $term ) {
			// Each word starts with a capital letter, so "café-bar" becomes #CaféBar. Other letters do not change.
			$words = preg_split( '/[^\p{L}\p{N}]+/u', (string) $term->name, -1, PREG_SPLIT_NO_EMPTY );
			$tag   = implode(
				'',
				array_map(
					static function ( $word ) {
						return mb_strtoupper( mb_substr( $word, 0, 1 ) ) . mb_substr( $word, 1 );
					},
					(array) $words
				)
			);
			if ( '' !== $tag ) {
				$tags[] = '#' . $tag;
			}
		}
		return implode( ' ', array_unique( $tags ) );
	}
}
