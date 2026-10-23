<?php
/**
 * A service that writes text.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\AI;

defined( 'ABSPATH' ) || exit;

/**
 * One AI provider. Register more through the `sint/ai_providers` filter.
 */
interface ProviderInterface {

	/**
	 * Unique key, for example 'openai'.
	 */
	public function key(): string;

	/**
	 * Name shown in Settings.
	 */
	public function label(): string;

	/**
	 * Whether the person enters an API key for it.
	 */
	public function needs_key(): bool;

	/**
	 * Model used when Settings leaves the model empty. Empty when the provider has no choice.
	 */
	public function default_model(): string;

	/**
	 * Writes text.
	 *
	 * @param string $system Instructions.
	 * @param string $prompt The request, with the content to write about.
	 * @param string $key    API key, or '' when needs_key() is false.
	 * @param string $model  Model, or '' for the default.
	 * @return string The text.
	 * @throws AIException When the provider returns no text.
	 */
	public function write( string $system, string $prompt, string $key, string $model ): string;
}
