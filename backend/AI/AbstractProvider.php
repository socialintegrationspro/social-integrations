<?php
/**
 * Shared HTTP handling for AI providers.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\AI;

defined( 'ABSPATH' ) || exit;

/**
 * Sends JSON, decodes JSON, and turns error answers into messages a person can act on.
 */
abstract class AbstractProvider implements ProviderInterface {

	/**
	 * {@inheritDoc}
	 */
	public function needs_key(): bool {
		return true;
	}

	/**
	 * The model to use: the given model, or the default model when it is empty.
	 *
	 * @param string $model Model from Settings.
	 */
	protected function model( string $model ): string {
		return '' !== $model ? $model : $this->default_model();
	}

	/**
	 * POSTs JSON and returns the decoded answer.
	 *
	 * @param string $url     URL.
	 * @param array  $headers Headers.
	 * @param array  $body    Body.
	 * @throws AIException On a transport error or an HTTP status of 400 or more.
	 */
	protected function post( string $url, array $headers, array $body ): array {
		$response = wp_remote_post(
			$url,
			array(
				'headers' => $headers + array( 'Content-Type' => 'application/json' ),
				'body'    => (string) wp_json_encode( $body ),
				'timeout' => 90,
			)
		);
		if ( is_wp_error( $response ) ) {
			/* translators: 1: provider name, 2: transport error */
			throw new AIException( esc_html( sprintf( __( 'Cannot connect to %1$s: %2$s', 'social-integrations' ), $this->label(), $response->get_error_message() ) ) );
		}
		$status = (int) wp_remote_retrieve_response_code( $response );
		$data   = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		$data   = is_array( $data ) ? $data : array();
		if ( $status >= 400 ) {
			throw new AIException( esc_html( $this->error_message( $status, $data ) ) );
		}
		return $data;
	}

	/**
	 * Message for an error answer.
	 *
	 * @param int   $status HTTP status.
	 * @param array $data   Decoded body.
	 */
	protected function error_message( int $status, array $data ): string {
		if ( 401 === $status || 403 === $status ) {
			/* translators: %s: provider name */
			return sprintf( __( '%s did not accept the API key. Check it in Settings.', 'social-integrations' ), $this->label() );
		}
		if ( 429 === $status || 529 === $status || 503 === $status ) {
			/* translators: %s: provider name */
			return sprintf( __( '%s is busy, or the account is at its limit. Try again in a minute.', 'social-integrations' ), $this->label() );
		}
		$detail = (string) ( $data['error']['message'] ?? '' );
		/* translators: 1: provider name, 2: reason from the provider */
		return trim( sprintf( __( '%1$s did not write the caption. %2$s', 'social-integrations' ), $this->label(), $detail ) );
	}

	/**
	 * Throws when the answer has no text.
	 *
	 * @param string $text Text from the answer.
	 * @throws AIException When it is empty.
	 */
	protected function require_text( string $text ): string {
		$text = trim( $text );
		if ( '' === $text ) {
			/* translators: %s: provider name */
			throw new AIException( esc_html( sprintf( __( '%s returned no caption. Try again.', 'social-integrations' ), $this->label() ) ) );
		}
		return $text;
	}
}
