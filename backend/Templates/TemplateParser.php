<?php
/**
 * Caption templates.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Templates;

use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Hooks;

defined( 'ABSPATH' ) || exit;

/**
 * Replaces {title}, {excerpt}, {url}, {tags}, {author}, {site}, {text} and
 * {field:meta_key} in a caption template.
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
		);
		return apply_filters( Hooks::TEMPLATE_TOKENS, $tokens, $post );
	}

	/**
	 * Fills a template.
	 *
	 * @param string   $template Template.
	 * @param \WP_Post $post     Post.
	 * @param array    $tokens   Token values.
	 */
	public function render( string $template, \WP_Post $post, array $tokens ): string {
		$output = preg_replace_callback(
			'/\{field:([a-zA-Z0-9_\-]+)\}/',
			static function ( $m ) use ( $post ) {
				$value = get_post_meta( $post->ID, $m[1], true );
				return is_scalar( $value ) ? (string) $value : '';
			},
			$template
		);
		foreach ( $tokens as $key => $value ) {
			$output = str_replace( '{' . $key . '}', (string) $value, (string) $output );
		}
		// Lines that held only an empty token disappear.
		$output = preg_replace( "/\n{3,}/", "\n\n", (string) $output );
		return trim( (string) $output );
	}

	/**
	 * Post tags as hashtags.
	 *
	 * @param \WP_Post $post Post.
	 */
	private function hashtags( \WP_Post $post ): string {
		$terms = get_the_terms( $post, 'post_tag' );
		if ( ! is_array( $terms ) ) {
			return '';
		}
		$tags = array();
		foreach ( $terms as $term ) {
			$tag = preg_replace( '/[^\p{L}\p{N}_]/u', '', ucwords( $term->name ) );
			if ( $tag ) {
				$tags[] = '#' . $tag;
			}
		}
		return implode( ' ', $tags );
	}
}
