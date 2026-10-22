<?php
/**
 * Builds the share for a post.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Content;

use SocialIntegrations\Support\Settings;
use SocialIntegrations\Templates\TemplateParser;

defined( 'ABSPATH' ) || exit;

/**
 * Caption, link and media for a post, from its post type template and its blocks.
 */
final class ShareBuilder {

	const DEFAULT_TEMPLATE = "{title}\n\n{excerpt}\n\n{url}";

	/**
	 * Builds the share.
	 *
	 * @param \WP_Post $post Post.
	 * @return array ['caption', 'link', 'media', 'tokens', 'blocks'].
	 */
	public function build( \WP_Post $post ): array {
		$parsed   = ( new BlockParser() )->parse( $post );
		$parser   = new TemplateParser();
		$tokens   = $parser->tokens( $post, $parsed );
		$rule     = $this->rule( $post->post_type );
		$template = '' !== trim( (string) ( $rule['template'] ?? '' ) ) ? (string) $rule['template'] : self::DEFAULT_TEMPLATE;

		$custom = (string) get_post_meta( $post->ID, '_sint_caption', true );
		$base   = '' !== trim( $custom ) ? $custom : $template;

		return array(
			'caption' => $parser->render( $base, $post, $tokens ),
			'link'    => (string) get_permalink( $post ),
			'media'   => $this->media( $post, $parsed['media'] ),
			'tokens'  => $tokens,
			'blocks'  => $parsed['blocks'],
			'links'   => $parsed['links'],
		);
	}

	/**
	 * Auto-share rule for a post type.
	 *
	 * @param string $post_type Post type.
	 */
	public function rule( string $post_type ): array {
		$rules = (array) Settings::get( 'post_types', array() );
		return isset( $rules[ $post_type ] ) && is_array( $rules[ $post_type ] ) ? $rules[ $post_type ] : array();
	}

	/**
	 * Featured image first, then block media, without duplicates.
	 *
	 * @param \WP_Post $post        Post.
	 * @param array    $block_media Media from blocks.
	 */
	private function media( \WP_Post $post, array $block_media ): array {
		$items = array();
		$first = array_values(
			array_filter(
				$block_media,
				static function ( $item ) {
					return ! empty( $item['first'] );
				}
			)
		);
		foreach ( $first as $item ) {
			$items[] = $item;
		}

		$thumb = (int) get_post_thumbnail_id( $post );
		if ( $thumb ) {
			$items[] = array(
				'type'     => 'image',
				'id'       => $thumb,
				'url'      => (string) wp_get_attachment_url( $thumb ),
				'alt'      => (string) get_post_meta( $thumb, '_wp_attachment_image_alt', true ),
				'featured' => true,
			);
		}
		foreach ( $block_media as $item ) {
			if ( empty( $item['first'] ) ) {
				$items[] = $item;
			}
		}

		$seen   = array();
		$unique = array();
		foreach ( $items as $item ) {
			$key = $item['id'] ? 'id:' . $item['id'] : 'url:' . $item['url'];
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$unique[]     = $item;
		}
		return array_slice( $unique, 0, (int) Settings::get( 'max_images', 4 ) );
	}
}
