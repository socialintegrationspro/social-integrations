<?php
/**
 * Anthropic Claude, through the Messages API.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\AI;

defined( 'ABSPATH' ) || exit;

/**
 * Writes with the person's own Anthropic API key.
 *
 * The WordPress HTTP API is used instead of the Anthropic PHP SDK, so the plugin
 * keeps PHP 7.4 support and ships no extra dependencies.
 */
final class Claude extends AbstractProvider {

	const MODEL = 'claude-opus-5-5';

	/**
	 * {@inheritDoc}
	 */
	public function key(): string {
		return 'claude';
	}

	/**
	 * {@inheritDoc}
	 */
	public function label(): string {
		return 'Anthropic Claude';
	}

	/**
	 * {@inheritDoc}
	 */
	public function default_model(): string {
		return self::MODEL;
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param string $system Instructions.
	 * @param string $prompt Request.
	 * @param string $key    API key.
	 * @param string $model  Model.
	 * @throws AIException When Claude declines or returns no text.
	 */
	public function write( string $system, string $prompt, string $key, string $model ): string {
		$model   = $this->model( $model );
		$headers = array(
			'x-api-key'         => $key,
			'anthropic-version' => '2023-06-01',
		);
		$body    = array(
			'model'      => $model,
			'max_tokens' => 16000,
			'system'     => $system,
			'messages'   => array(
				array(
					'role'    => 'user',
					'content' => $prompt,
				),
			),
		);
		if ( self::MODEL === $model ) {
			// A caption is a small task: low effort keeps it fast and cheap. If Claude
			// declines the request, the API retries it on its recommended fallback model.
			$body['output_config']     = array( 'effort' => 'low' );
			$body['fallbacks']         = 'default';
			$headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
		}

		$data = $this->post( 'https://api.anthropic.com/v1/messages', $headers, $body );
		if ( 'refusal' === ( $data['stop_reason'] ?? '' ) ) {
			throw new AIException( esc_html__( 'Claude declined to write a caption for this content.', 'social-integrations' ) );
		}
		$text = '';
		foreach ( (array) ( $data['content'] ?? array() ) as $block ) {
			if ( 'text' === ( $block['type'] ?? '' ) ) {
				$text .= (string) ( $block['text'] ?? '' );
			}
		}
		return $this->require_text( $text );
	}
}
