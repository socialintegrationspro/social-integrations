<?php
/**
 * Writes captions with the selected AI provider.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\AI;

use SocialIntegrations\Content\ShareBuilder;
use SocialIntegrations\Support\Settings;
use SocialIntegrations\Templates\RichText;
use SocialIntegrations\Templates\TemplateParser;

defined( 'ABSPATH' ) || exit;

/**
 * Builds the request from a post or a caption, a mode (write, improve, shorter, longer, tone,
 * emojis, hashtags, translate), the tone and the length the networks allow, then cleans the
 * answer. The plugin adds the post link after the text, so the AI never writes or changes it.
 * A template keeps its tokens and style marks; a removed token gives a warning.
 */
final class CaptionGenerator {

	const TONES = array( 'friendly', 'professional', 'playful', 'informative', 'bold' );

	/**
	 * What the AI does with the caption. 'write' writes a new caption from the post, or a new template.
	 */
	const MODES = array( 'write', 'improve', 'shorter', 'longer', 'tone', 'emojis', 'hashtags', 'translate', 'prompt' );

	/**
	 * Problems in the last answer, such as a token that the AI removed.
	 *
	 * @var string[]
	 */
	private $warnings = array();

	/**
	 * Problems in the last answer that the user must know about.
	 *
	 * @return string[]
	 */
	public function warnings(): array {
		return $this->warnings;
	}

	/**
	 * Writes a caption.
	 *
	 * @param array $args [
	 *     'post_id'  => int,
	 *     'text'     => string,
	 *     'limit'    => int,
	 *     'tone'     => string,
	 *     'mode'     => string, one of MODES; empty: write from the post when there is no text, else improve,
	 *     'template' => bool, true when the text is a template with tokens such as {title}, which the AI keeps,
	 *     'tokens'   => string[], the tokens that a new template can use, such as '{title}',
	 *     'language' => string, the language for 'translate',
	 *     'prompt'   => string, the instructions of the user for 'prompt', a template with tokens that the plugin fills from the post,
	 * ].
	 * @return string The caption. A caption from a post ends with the post link; a template has no link.
	 * @throws AIException When no provider is ready or it returns nothing.
	 */
	public function write( array $args ): string {
		$this->warnings = array();
		$provider       = Providers::current();
		if ( ! $provider ) {
			throw new AIException( esc_html__( 'In Settings, select an AI provider. Then enter its API key.', 'social-integrations' ) );
		}

		$ai       = (array) Settings::get( 'ai', array() );
		$tone     = in_array( $args['tone'] ?? '', self::TONES, true ) ? $args['tone'] : (string) ( $ai['tone'] ?? 'friendly' );
		$template = ! empty( $args['template'] );
		$post     = ! empty( $args['post_id'] ) ? get_post( (int) $args['post_id'] ) : null;
		$text     = trim( (string) ( $args['text'] ?? '' ) );
		$link     = $post && ! $template ? (string) get_permalink( $post ) : '';
		$limit    = max( 80, min( 3000, (int) ( $args['limit'] ?? 500 ) ) );
		// Room for the link on its own line.
		$room = $limit - ( '' !== $link ? mb_strlen( $link ) + 2 : 0 );
		$room = max( 60, min( $room, 1200 ) );
		$mode = in_array( $args['mode'] ?? '', self::MODES, true ) ? (string) $args['mode'] : ( '' === $text ? 'write' : 'improve' );

		if ( ! in_array( $mode, array( 'write', 'prompt' ), true ) && '' === $text ) {
			throw new AIException( esc_html__( 'Write a caption first. Then the AI can change it.', 'social-integrations' ) );
		}
		if ( 'prompt' === $mode && ( ! $post || '' === trim( (string) ( $args['prompt'] ?? '' ) ) ) ) {
			throw new AIException( esc_html__( 'Write the instructions for the AI. Then select a post to test them with.', 'social-integrations' ) );
		}
		if ( 'write' === $mode && ! $post && ! $template ) {
			throw new AIException( esc_html__( 'Select an item from your site, or write a caption to improve.', 'social-integrations' ) );
		}

		$system = 'You write social media captions for posts on a website. Write in the language of the content. '
			. 'Reply with the caption text only: no quotes around it, no heading, no notes.';

		$rules = array(
			sprintf( 'At most %d characters.', $room ),
			'Tone: ' . $tone . '.',
		);
		if ( $template ) {
			$rules[] = 'The caption is a template. Text in curly braces, such as {title}, {price|upper}, {field:venue} or the style marks {b}…{/b}, is a placeholder. Keep each placeholder exactly as written, and do not fill it in.';
			$allowed = array_values( array_filter( array_map( 'strval', (array) ( $args['tokens'] ?? array() ) ) ) );
			if ( $allowed ) {
				$rules[] = 'You may use these placeholders: ' . implode( ' ', $allowed ) . '. Do not invent other placeholders.';
			}
			$rules[] = 'Do not write a link or URL; use {url} for the link of the post.';
		} else {
			$rules[] = 'Do not include any link or URL; the link is added after your caption.';
		}
		if ( 'write' === $mode || 'improve' === $mode ) {
			$rules[] = 'You may end with up to three relevant hashtags.';
		}
		$rules = "Rules:\n- " . implode( "\n- ", $rules );

		$task = array(
			'improve'   => 'Improve this caption. Keep its meaning and any facts as they are.',
			'shorter'   => 'Make this caption shorter. Keep the main message and the facts.',
			'longer'    => 'Make this caption longer and more detailed. Do not add facts that the caption does not give.',
			'tone'      => sprintf( 'Write this caption again in a %s tone. Keep its meaning and the facts.', $tone ),
			'emojis'    => 'Add one to three emojis to this caption where they fit. Do not change the words.',
			'hashtags'  => 'Add up to three relevant hashtags at the end of this caption. Do not change the other text.',
			'translate' => sprintf( 'Translate this caption into %s. Keep names, prices and hashtags as they are.', sanitize_text_field( (string) ( $args['language'] ?? 'English' ) ) ),
		);

		if ( 'prompt' === $mode ) {
			$builder = new ShareBuilder();
			$share   = $builder->build( $post );
			// The instructions are a template too: {title}, {price} and the fields get the values of the post.
			$do     = RichText::plain( ( new TemplateParser() )->render( (string) $args['prompt'], $post, $share['tokens'] ) );
			$prompt = "Write a caption for this post. Follow the instructions of the user.\n\n<instructions>\n" . mb_substr( $do, 0, 4000 ) . "\n</instructions>\n\n<post>\n"
				. 'Title: ' . (string) ( $share['tokens']['title'] ?? '' ) . "\n"
				. 'Excerpt: ' . (string) ( $share['tokens']['excerpt'] ?? '' ) . "\n"
				. 'Text: ' . mb_substr( (string) ( $share['tokens']['text'] ?? '' ), 0, 6000 ) . "\n"
				. "</post>\n\n" . $rules;
		} elseif ( 'write' === $mode && $post ) {
			$tokens = ( new ShareBuilder() )->build( $post )['tokens'];
			$prompt = ( $template ? 'Write a caption template for posts like this one.' : 'Write a caption for this post.' ) . "\n\n<post>\n"
				. 'Title: ' . (string) ( $tokens['title'] ?? '' ) . "\n"
				. 'Excerpt: ' . (string) ( $tokens['excerpt'] ?? '' ) . "\n"
				. 'Text: ' . mb_substr( (string) ( $tokens['text'] ?? '' ), 0, 6000 ) . "\n"
				. "</post>\n\n" . $rules;
		} elseif ( 'write' === $mode ) {
			$prompt = "Write a caption template for the posts of this website. Use the placeholders for the values of each post.\n\n" . $rules;
		} else {
			$prompt = $task[ $mode ] . "\n\n<caption>\n"
				. ( '' !== $link ? trim( str_replace( $link, '', $text ) ) : $text )
				. "\n</caption>\n\n" . $rules;
		}

		$out = $provider->write( $system, $prompt, $provider->needs_key() ? Providers::key( $provider->key() ) : '', (string) ( $ai['model'] ?? '' ) );
		$out = $this->tidy( $out, $template ? 3000 : $room );
		if ( $template ) {
			return $this->check_template( $text, $out );
		}
		return '' !== $link ? $out . "\n\n" . $link : $out;
	}

	/**
	 * Repairs the style marks of a template that the AI wrote, and notes each token that it removed.
	 *
	 * @param string $before The template before.
	 * @param string $after  The template from the AI.
	 */
	private function check_template( string $before, string $after ): string {
		if ( RichText::has_marks( $after ) ) {
			// A mark without its pair ends at the end of its line, and the marks close in order again.
			$after = RichText::join( RichText::parse( $after ) );
		}
		$tokens = static function ( string $text ): array {
			preg_match_all( '/\{(field:[A-Za-z0-9_\-]+|[A-Za-z0-9_]+)(?:\|[^{}\n]*)?\}/', $text, $m );
			return array_values( array_diff( array_unique( $m[0] ), array( '{b}', '{i}', '{u}', '{s}', '{m}' ) ) );
		};
		foreach ( array_diff( $tokens( $before ), $tokens( $after ) ) as $token ) {
			/* translators: %s: a token, such as {price} */
			$this->warnings[] = sprintf( __( 'The AI removed %s. Add it again if the caption needs it.', 'social-integrations' ), $token );
		}
		return $after;
	}

	/**
	 * Removes the quotes around the answer, and shortens it at a word when it is too long.
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
