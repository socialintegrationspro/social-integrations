<?php
/**
 * Google Gemini, through the Gemini API.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\AI;

defined( 'ABSPATH' ) || exit;

/**
 * Writes with the person's own Gemini API key.
 */
final class Gemini extends AbstractProvider {

	/**
	 * {@inheritDoc}
	 */
	public function key(): string {
		return 'gemini';
	}

	/**
	 * {@inheritDoc}
	 */
	public function label(): string {
		return 'Google Gemini';
	}

	/**
	 * {@inheritDoc}
	 */
	public function default_model(): string {
		return 'gemini-2.5-flash';
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
		$model = $this->model( $model );
		$data  = $this->post(
			'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode( $model ) . ':generateContent',
			array( 'x-goog-api-key' => $key ),
			array(
				'systemInstruction' => array( 'parts' => array( array( 'text' => $system ) ) ),
				'contents'          => array(
					array(
						'role'  => 'user',
						'parts' => array( array( 'text' => $prompt ) ),
					),
				),
			)
		);
		$text  = '';
		foreach ( (array) ( $data['candidates'][0]['content']['parts'] ?? array() ) as $part ) {
			$text .= (string) ( $part['text'] ?? '' );
		}
		return $this->require_text( $text );
	}
}
