<?php
/**
 * Turns the blocks of a post into caption text, media and links.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Content;

use SocialIntegrations\Hooks;
use SocialIntegrations\Support\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Applies the block rules from Settings, and the per-block `sintSocial` attribute
 * an editor sets from the block toolbar.
 *
 * Rules: 'text' (adds to the caption body), 'excerpt' (adds to {excerpt} when the
 * post has no excerpt), 'media' (images and video), 'link' (embed URLs), 'skip'
 * (not used), 'remove' (never sent, even as fallback text).
 */
final class BlockParser {

	/**
	 * Parses a post.
	 *
	 * @param \WP_Post $post Post.
	 * @return array ['excerpt' => string, 'text' => string, 'media' => array, 'links' => string[], 'blocks' => array].
	 */
	public function parse( \WP_Post $post ): array {
		$rules    = (array) Settings::get( 'blocks', array() );
		$fallback = (string) Settings::get( 'block_fallback', 'text' );
		$override = (bool) Settings::get( 'allow_block_override', true );

		$result = array(
			'excerpt' => array(),
			'text'    => array(),
			'media'   => array(),
			'links'   => array(),
			'blocks'  => array(),
		);

		if ( has_blocks( $post->post_content ) ) {
			$this->walk( parse_blocks( $post->post_content ), $rules, $fallback, $override, $result );
		} else {
			$plain = trim( wp_strip_all_tags( strip_shortcodes( $post->post_content ) ) );
			if ( '' !== $plain ) {
				$result['excerpt'][] = $plain;
			}
		}

		$first = array_values(
			array_filter(
				$result['media'],
				static function ( $item ) {
					return ! empty( $item['first'] );
				}
			)
		);
		$rest  = array_values(
			array_filter(
				$result['media'],
				static function ( $item ) {
					return empty( $item['first'] );
				}
			)
		);

		return array(
			'excerpt' => wp_trim_words( implode( ' ', $result['excerpt'] ), 55, '…' ),
			'text'    => trim( implode( "\n\n", $result['text'] ) ),
			'media'   => array_merge( $first, $rest ),
			'links'   => array_values( array_unique( $result['links'] ) ),
			'blocks'  => $result['blocks'],
		);
	}

	/**
	 * Visits blocks depth first.
	 *
	 * @param array  $blocks   Parsed blocks.
	 * @param array  $rules    Block name => use.
	 * @param string $fallback Use for blocks without a rule.
	 * @param bool   $override Whether the per-block attribute counts.
	 * @param array  $result   Collected parts, by reference.
	 */
	private function walk( array $blocks, array $rules, string $fallback, bool $override, array &$result ): void {
		foreach ( $blocks as $block ) {
			$name = (string) ( $block['blockName'] ?? '' );
			if ( '' === $name ) {
				continue;
			}

			$attrs  = (array) ( $block['attrs'] ?? array() );
			$social = $override && isset( $attrs['sintSocial'] ) && is_array( $attrs['sintSocial'] ) ? $attrs['sintSocial'] : array();
			$use    = isset( $social['use'] ) && in_array( $social['use'], Settings::BLOCK_USES, true )
				? $social['use']
				: ( $rules[ $name ] ?? ( 'core/gallery' === $name || ! empty( $block['innerBlocks'] ) ? 'container' : $fallback ) );

			$result['blocks'][] = array(
				'name' => $name,
				'use'  => 'container' === $use ? 'text' : $use,
			);

			if ( 'remove' === $use || 'skip' === $use ) {
				continue;
			}

			// Containers (group, columns, gallery) pass their rule to the blocks inside them.
			if ( ! empty( $block['innerBlocks'] ) ) {
				$inner_rules = $rules;
				if ( 'core/gallery' === $name && 'media' === $use ) {
					$inner_rules['core/image'] = 'media';
				}
				$this->walk( $block['innerBlocks'], $inner_rules, $fallback, $override, $result );
				if ( 'container' === $use || 'core/gallery' === $name ) {
					continue;
				}
			}

			$part = $this->part( $block, $use, ! empty( $social['first'] ) );
			$part = apply_filters( Hooks::BLOCK_PART, $part, $block, $use );

			if ( 'excerpt' === $use && '' !== $part['text'] ) {
				$result['excerpt'][] = $part['text'];
			} elseif ( '' !== $part['text'] ) {
				$result['text'][] = $part['text'];
			}
			foreach ( $part['media'] as $item ) {
				$result['media'][] = $item;
			}
			foreach ( $part['links'] as $link ) {
				$result['links'][] = $link;
			}
		}
	}

	/**
	 * What one block adds.
	 *
	 * @param array  $block Parsed block.
	 * @param string $use   Rule.
	 * @param bool   $first Whether the editor asked to show this media first.
	 * @return array ['text' => string, 'media' => array, 'links' => array].
	 */
	private function part( array $block, string $use, bool $first ): array {
		$part  = array(
			'text'  => '',
			'media' => array(),
			'links' => array(),
		);
		$attrs = (array) ( $block['attrs'] ?? array() );
		$html  = (string) ( $block['innerHTML'] ?? '' );

		switch ( $use ) {
			case 'media':
				$item = $this->media( $block['blockName'], $attrs, $html );
				if ( $item ) {
					$item['first']   = $first;
					$part['media'][] = $item;
				}
				break;
			case 'link':
				$url = (string) ( $attrs['url'] ?? '' );
				if ( '' === $url && preg_match( '/https?:\/\/[^\s"<]+/', $html, $m ) ) {
					$url = $m[0];
				}
				if ( '' !== $url ) {
					$part['links'][] = esc_url_raw( $url );
				}
				break;
			case 'text':
			case 'excerpt':
				$part['text'] = $this->plain( $html );
				break;
		}
		return $part;
	}

	/**
	 * Media item from an image or video block.
	 *
	 * @param string $name  Block name.
	 * @param array  $attrs Attributes.
	 * @param string $html  Saved markup.
	 * @return array|null ['type', 'id', 'url', 'alt'].
	 */
	private function media( string $name, array $attrs, string $html ): ?array {
		$id   = (int) ( $attrs['id'] ?? 0 );
		$type = 'core/video' === $name ? 'video' : 'image';
		$url  = '';
		$alt  = '';

		if ( $id ) {
			$url = (string) wp_get_attachment_url( $id );
			$alt = (string) get_post_meta( $id, '_wp_attachment_image_alt', true );
		}
		if ( '' === $url ) {
			$pattern = 'video' === $type ? '/<video[^>]+src="([^"]+)"/i' : '/<img[^>]+src="([^"]+)"/i';
			if ( preg_match( $pattern, $html, $m ) ) {
				$url = html_entity_decode( $m[1] );
			}
		}
		if ( '' === $alt && preg_match( '/<img[^>]+alt="([^"]*)"/i', $html, $m ) ) {
			$alt = html_entity_decode( $m[1] );
		}
		if ( '' === $url ) {
			return null;
		}
		return array(
			'type' => $type,
			'id'   => $id,
			'url'  => esc_url_raw( $url ),
			'alt'  => sanitize_text_field( $alt ),
		);
	}

	/**
	 * Visible text of block markup.
	 *
	 * @param string $html Markup.
	 */
	private function plain( string $html ): string {
		$html = preg_replace( '/<\/(p|li|h[1-6]|div)>/i', "$0\n", $html );
		$text = html_entity_decode( wp_strip_all_tags( (string) $html ), ENT_QUOTES, 'UTF-8' );
		return trim( preg_replace( "/\n{3,}/", "\n\n", preg_replace( '/[ \t]+/', ' ', $text ) ) );
	}
}
