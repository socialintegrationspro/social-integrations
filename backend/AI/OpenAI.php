<?php
/**
 * OpenAI, through the Chat Completions API.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\AI;

defined( 'ABSPATH' ) || exit;

/**
 * Writes with the person's own OpenAI API key.
 */
final class OpenAI extends AbstractProvider {

	/**
	 * {@inheritDoc}
	 */
	public function key(): string {
		return 'openai';
	}

	/**
	 * {@inheritDoc}
	 */
	public function label(): string {
		return 'OpenAI';
	}

	/**
	 * {@inheritDoc}
	 */
	public function default_model(): string {
		return 'gpt-5-mini';
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param string $system Instructions.
	 * @param string $prompt Request.
	 * @param string $key    API key.
	 * @param string $model  Model.
	 */
	public function write( string $system, string $prompt, string $key, string $model ): string {
		$data = $this->post(
			'https://api.openai.com/v1/chat/completions',
			array( 'Authorization' => 'Bearer ' . $key ),
			array(
				'model'    => '' !== $model ? $model : $this->default_model(),
				'messages' => array(
					array(
						'role'    => 'system',
						'content' => $system,
					),
					array(
						'role'    => 'user',
						'content' => $prompt,
					),
				),
			)
		);
		return $this->require_text( (string) ( $data['choices'][0]['message']['content'] ?? '' ) );
	}
}
