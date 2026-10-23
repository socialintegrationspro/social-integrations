<?php
/**
 * Builds the share for a post.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Content;

use SocialIntegrations\Hooks;
use SocialIntegrations\Scheduler\AutoShare;
use SocialIntegrations\Support\Settings;
use SocialIntegrations\Templates\TemplateParser;

defined( 'ABSPATH' ) || exit;

/**
 * Caption, link and media for a post, from its post type template and its blocks.
 */
final class ShareBuilder {

	const DEFAULT_TEMPLATE = "{title}\n\n{excerpt}\n\n{url}";

	/**
	 * Where a share's media comes from.
	 *
	 * - auto:     marked blocks, then the featured image, then the other block media.
	 * - featured: the featured image, or the first block media when there is none.
	 * - content:  media from the post's blocks only.
	 * - custom:   the images selected in the template.
	 * - none:     text and link only.
	 */
	const MEDIA_SOURCES = array( 'auto', 'featured', 'content', 'custom', 'none' );

	/**
	 * Parsed blocks and tokens by post ID, so the plugin parses a post one time for several accounts.
	 *
	 * @var array<int, array>
	 */
	private $parsed = array();

	/**
	 * Builds the share.
	 *
	 * @param \WP_Post $post    Post.
	 * @param array    $account The account it goes to; empty when not known yet.
	 * @param string   $context Who asks: 'auto' on publish, 'composer' in the admin app.
	 * @param array    $base    The template to start from, such as an auto-post campaign's;
	 *                          empty for the default caption and media.
	 * @return array ['caption', 'captions', 'link', 'media', 'tokens', 'blocks', 'links'].
	 */
	public function build( \WP_Post $post, array $account = array(), string $context = 'composer', array $base = array() ): array {
		if ( ! isset( $this->parsed[ $post->ID ] ) ) {
			$blocks                    = ( new BlockParser() )->parse( $post );
			$this->parsed[ $post->ID ] = array(
				'blocks' => $blocks,
				'tokens' => ( new TemplateParser() )->tokens( $post, $blocks ),
			);
		}
		$parsed   = $this->parsed[ $post->ID ]['blocks'];
		$tokens   = $this->parsed[ $post->ID ]['tokens'];
		$parser   = new TemplateParser();
		$template = $this->template( $post, $account, $context, $base );

		$captions = array();
		$custom   = (string) get_post_meta( $post->ID, AutoShare::META_CAPTION, true );
		if ( '' !== trim( $custom ) ) {
			// The editor wrote this post's caption; it goes to every network as written.
			$base = $custom;
		} else {
			$base = $template['caption'];
			foreach ( $template['captions'] as $network => $text ) {
				$captions[ $network ] = $parser->render( $text, $post, $tokens );
			}
		}
		$caption = $parser->render( $base, $post, $tokens );
		$network = (string) ( $account['network'] ?? '' );

		return array(
			'caption'  => '' !== $network && isset( $captions[ $network ] ) ? $captions[ $network ] : $caption,
			'captions' => $captions,
			'link'     => (string) get_permalink( $post ),
			'media'    => $this->media( $post, $parsed['media'], $template ),
			'tokens'   => $tokens,
			'blocks'   => $parsed['blocks'],
			'links'    => $parsed['links'],
		);
	}

	/**
	 * The template a share uses: the one given, unless a filter supplies another.
	 *
	 * @param \WP_Post $post    Post.
	 * @param array    $account Account, or empty.
	 * @param string   $context Who asks.
	 * @param array    $base    Template to start from; empty for the default.
	 * @return array{caption: string, captions: array<string, string>, media: string, custom_media: array}
	 */
	public function template( \WP_Post $post, array $account = array(), string $context = 'composer', array $base = array() ): array {
		$template = array(
			'caption'      => (string) ( $base['caption'] ?? '' ),
			'captions'     => (array) ( $base['captions'] ?? array() ),
			'media'        => (string) ( $base['media'] ?? 'auto' ),
			'custom_media' => (array) ( $base['custom_media'] ?? array() ),
		);
		$template = (array) apply_filters( Hooks::SHARE_TEMPLATE, $template, $post, $account, $context );

		$captions = array();
		foreach ( (array) ( $template['captions'] ?? array() ) as $network => $text ) {
			if ( is_string( $text ) && '' !== trim( $text ) ) {
				$captions[ (string) $network ] = $text;
			}
		}
		$caption = (string) ( $template['caption'] ?? '' );
		$media   = (string) ( $template['media'] ?? 'auto' );
		return array(
			'caption'      => '' !== trim( $caption ) ? $caption : self::DEFAULT_TEMPLATE,
			'captions'     => $captions,
			'media'        => in_array( $media, self::MEDIA_SOURCES, true ) ? $media : 'auto',
			'custom_media' => (array) ( $template['custom_media'] ?? array() ),
		);
	}

	/**
	 * Sanitizes the caption and media of a template that the admin app sends.
	 *
	 * @param array $input Raw template.
	 * @return array{caption: string, captions: array, media: string, custom_media: array}
	 */
	public static function clean_template( array $input ): array {
		$media = (string) ( $input['media'] ?? 'auto' );
		return array(
			'caption'      => sanitize_textarea_field( (string) ( $input['caption'] ?? '' ) ),
			'captions'     => Settings::captions( (array) ( $input['captions'] ?? array() ) ),
			'media'        => in_array( $media, self::MEDIA_SOURCES, true ) ? $media : 'auto',
			'custom_media' => Settings::media_items( (array) ( $input['custom_media'] ?? array() ) ),
		);
	}

	/**
	 * A media item for an attachment, or null when it is not an image or video.
	 *
	 * @param int $id Attachment ID.
	 */
	public static function attachment( int $id ): ?array {
		$mime = (string) get_post_mime_type( $id );
		$url  = (string) wp_get_attachment_url( $id );
		if ( '' === $url || ( 0 !== strpos( $mime, 'image/' ) && 0 !== strpos( $mime, 'video/' ) ) ) {
			return null;
		}
		return array(
			'type' => 0 === strpos( $mime, 'video/' ) ? 'video' : 'image',
			'id'   => $id,
			'url'  => $url,
			'alt'  => (string) get_post_meta( $id, '_wp_attachment_image_alt', true ),
		);
	}

	/**
	 * Media for the share, from the template's media source, without duplicates.
	 *
	 * @param \WP_Post $post        Post.
	 * @param array    $block_media Media from blocks.
	 * @param array    $template    Template.
	 */
	private function media( \WP_Post $post, array $block_media, array $template ): array {
		$first = array();
		$rest  = array();
		foreach ( $block_media as $item ) {
			if ( empty( $item['first'] ) ) {
				$rest[] = $item;
			} else {
				$first[] = $item;
			}
		}

		$thumb    = (int) get_post_thumbnail_id( $post );
		$featured = $thumb ? self::attachment( $thumb ) : null;
		if ( $featured ) {
			$featured['featured'] = true;
		}

		switch ( $template['media'] ) {
			case 'none':
				return array();
			case 'custom':
				$items = array();
				foreach ( $template['custom_media'] as $chosen ) {
					$item = self::attachment( (int) ( is_array( $chosen ) ? ( $chosen['id'] ?? 0 ) : $chosen ) );
					if ( $item ) {
						$items[] = $item;
					}
				}
				break;
			case 'featured':
				$items = $featured ? array( $featured ) : array_slice( array_merge( $first, $rest ), 0, 1 );
				break;
			case 'content':
				$items = array_merge( $first, $rest );
				break;
			default:
				$items = array_merge( $first, $featured ? array( $featured ) : array(), $rest );
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
