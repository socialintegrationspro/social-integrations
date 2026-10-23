<?php
/**
 * Writes captions with the chosen AI provider.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\AI;

use SocialIntegrations\Content\ShareBuilder;
use SocialIntegrations\Support\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Builds the request from a post (or a caption to improve), the tone in Settings and
 * the length the networks allow, then cleans up the answer. The post link is added by
 * the plugin after the text, so the AI never writes or changes it.
 */
final class CaptionGenerator {

	const TONES = array( 'friendly', 'professional', 'playful', 'informative', 'bold' );

	/**
	 * Writes a caption.
	 *
	 * @param array $args ['post_id' => int, 'text' => string, 'limit' => int, 'tone' => string].
	 * @return string The caption, ending with the post link when there is a post.
	 * @throws AIException When no provider is ready or it returns nothing.
	 */
	public function write( array $args ): string {
		$provider = Providers::current();
		if ( ! $provider ) {
			throw new AIException( esc_html__( 'Choose an AI provider and enter its API key in Settings first.', 'social-integrations' ) );
		}

		$ai    = (array) Settings::get( 'ai', array() );
		$tone  = in_array( $args['tone'] ?? '', self::TONES, true ) ? $args['tone'] : (string) ( $ai['tone'] ?? 'friendly' );
		$post  = ! empty( $args['post_id'] ) ? get_post( (int) $args['post_id'] ) : null;
		$text  = trim( (string) ( $args['text'] ?? '' ) );
		$link  = $post ? (string) get_permalink( $post ) : '';
		$limit = max( 80, min( 3000, (int) ( $args['limit'] ?? 500 ) ) );
		// Room for the link on its own line.
		$room = $limit - ( '' !== $link ? mb_strlen( $link ) + 2 : 0 );
		$room = max( 60, min( $room, 1200 ) );

		if ( ! $post && '' === $text ) {
			throw new AIException( esc_html__( 'Select an item from your site, or write a caption to improve.', 'social-integrations' ) );
		}

		$system = 'You write social media captions for posts on a website. Write in the language of the content. '
			. 'Reply with the caption text only: no quotes around it, no heading, no notes.';

		$rules = sprintf(
			"Rules:\n- At most %d characters.\n- Tone: %s.\n- Do not include any link or URL; the link is added after your caption.\n- You may end with up to three relevant hashtags.",
			$room,
			$tone
		);

		if ( $post && '' === $text ) {
			$tokens = ( new ShareBuilder() )->build( $post )['tokens'];
			$prompt = "Write a caption for this post.\n\n<post>\n"
				. 'Title: ' . (string) ( $tokens['title'] ?? '' ) . "\n"
				. 'Excerpt: ' . (string) ( $tokens['excerpt'] ?? '' ) . "\n"
				. 'Text: ' . mb_substr( (string) ( $tokens['text'] ?? '' ), 0, 6000 ) . "\n"
				. "</post>\n\n" . $rules;
		} else {
			$prompt = "Improve this caption. Keep its meaning and any facts as they are.\n\n<caption>\n"
				. ( '' !== $link ? trim( str_replace( $link, '', $text ) ) : $text )
				. "\n</caption>\n\n" . $rules;
		}

		$out = $provider->write( $system, $prompt, $provider->needs_key() ? Providers::key( $provider->key() ) : '', (string) ( $ai['model'] ?? '' ) );
		$out = $this->tidy( $out, $room );
		return '' !== $link ? $out . "\n\n" . $link : $out;
	}

	/**
	 * Removes wrapping quotes and shortens at a word when the answer is too long.
	 *
	 * @param string $text Answer.
	 * @param int    $max  Maximum characters.
	 */
	private function tidy( string $text, int $max ): string {
		$text = trim( $text );
		$text = (string) preg_replace( '/^["“”\']+|["“”\']+$/u', '', $text );
		$text = trim( $text );
		if ( mb_strlen( $text ) <= $max ) {
			return $text;
		}
		$cut   = mb_substr( $text, 0, $max - 1 );
		$space = mb_strrpos( $cut, ' ' );
		return rtrim( false !== $space && $space > $max * 0.6 ? mb_substr( $cut, 0, $space ) : $cut, ' ,.;:-' ) . '…';
	}
}
