<?php
/**
 * An AI request that did not produce a caption.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\AI;

defined( 'ABSPATH' ) || exit;

/**
 * Holds a message that tells a person what to do, such as "The OpenAI key was not accepted."
 */
class AIException extends \RuntimeException {}
