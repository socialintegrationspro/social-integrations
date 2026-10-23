<?php
/**
 * An AI request that did not produce a caption.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\AI;

defined( 'ABSPATH' ) || exit;

/**
 * Carries a message a person can act on, such as "The OpenAI key was not accepted."
 */
class AIException extends \RuntimeException {}
