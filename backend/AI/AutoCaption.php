<?php
/**
 * Captions that the AI writes for an auto-post campaign.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\AI;

defined( 'ABSPATH' ) || exit;

/**
 * Writes the caption of one post for one campaign, from the campaign's instructions.
 *
 * The AI writes one caption for the post. An account whose network allows fewer characters
 * gets a shorter version, one time for each limit. When the AI fails, caption() gives null,
 * and the share uses the template caption.
 */
final class AutoCaption {

	/**
	 * The longest caption that the AI writes.
	 */
	const MAX = 600;

	/**
	 * Post meta with the last AI error of each campaign, for the user to see why the template caption was used.
	 */
	const META_ERROR = '_sint_ai_error';

	/**
	 * Post meta: the AI error for each batch of shares that got the template caption, so the share log can say why.
	 */
	const META_FALLBACK = '_sint_ai_fallback';

	/**
	 * Post.
	 *
	 * @var \WP_Post
	 */
	private $post;

	/**
	 * AI settings of the campaign: on, prompt, tone.
	 *
	 * @var array
	 */
	private $ai;

	/**
	 * Campaign ID.
	 *
	 * @var int
	 */
	private $campaign;

	/**
	 * The message of the last AI error, or ''.
	 *
	 * @var string
	 */
	private $error = '';

	/**
	 * Captions by limit; false when the AI failed.
	 *
	 * @var array<int, string|false>
	 */
	private $done = array();

	/**
	 * Gives a writer for the campaign, or null when the campaign does not use the AI.
	 *
	 * @param \WP_Post $post     Post.
	 * @param array    $campaign Auto-post campaign.
	 */
	public static function for_campaign( \WP_Post $post, array $campaign ): ?self {
		$ai = (array) ( $campaign['ai'] ?? array() );
		if ( empty( $ai['on'] ) || '' === trim( (string) ( $ai['prompt'] ?? '' ) ) ) {
			return null;
		}
		return new self( $post, $ai, (int) ( $campaign['id'] ?? 0 ) );
	}

	/**
	 * Constructor.
	 *
	 * @param \WP_Post $post     Post.
	 * @param array    $ai       AI settings.
	 * @param int      $campaign Campaign ID.
	 */
	private function __construct( \WP_Post $post, array $ai, int $campaign ) {
		$this->post     = $post;
		$this->ai       = $ai;
		$this->campaign = $campaign;
	}

	/**
	 * The caption for a network with a character limit, or null when the AI failed.
	 *
	 * @param int $limit Character limit of the network.
	 */
	public function caption( int $limit ): ?string {
		$limit = max( 80, min( self::MAX, $limit ) );
		if ( ! isset( $this->done[ self::MAX ] ) ) {
			$this->done[ self::MAX ] = $this->ask( array( 'mode' => 'prompt' ), self::MAX );
		}
		$first = $this->done[ self::MAX ];
		if ( false === $first ) {
			return null;
		}
		if ( mb_strlen( $first ) <= $limit ) {
			return $first;
		}
		if ( ! isset( $this->done[ $limit ] ) ) {
			$this->done[ $limit ] = $this->ask(
				array(
					'mode' => 'shorter',
					'text' => $first,
				),
				$limit
			);
		}
		return false === $this->done[ $limit ] ? null : $this->done[ $limit ];
	}

	/**
	 * Notes that a batch of shares got the template caption because the AI failed.
	 *
	 * @param string $batch Batch ID of the shares.
	 */
	public function note_fallback( string $batch ): void {
		if ( '' === $this->error ) {
			return;
		}
		$notes           = (array) get_post_meta( $this->post->ID, self::META_FALLBACK, true );
		$notes[ $batch ] = $this->error;
		update_post_meta( $this->post->ID, self::META_FALLBACK, $notes );
	}

	/**
	 * The AI error of a share, when it got the template caption, or ''.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $batch   Batch ID of the share.
	 */
	public static function fallback_error( int $post_id, string $batch ): string {
		$notes = get_post_meta( $post_id, self::META_FALLBACK, true );
		return is_array( $notes ) && isset( $notes[ $batch ] ) ? (string) $notes[ $batch ] : '';
	}

	/**
	 * One request to the AI.
	 *
	 * @param array $args  Arguments for CaptionGenerator::write().
	 * @param int   $limit Character limit.
	 * @return string|false The caption, or false when the AI failed.
	 */
	private function ask( array $args, int $limit ) {
		try {
			$caption = ( new CaptionGenerator() )->write(
				$args + array(
					'post_id' => $this->post->ID,
					'prompt'  => (string) $this->ai['prompt'],
					'tone'    => (string) ( $this->ai['tone'] ?? '' ),
					'limit'   => $limit,
				)
			);
			$errors  = (array) get_post_meta( $this->post->ID, self::META_ERROR, true );
			unset( $errors[ $this->campaign ] );
			update_post_meta( $this->post->ID, self::META_ERROR, $errors );
			return $caption;
		} catch ( \Throwable $e ) {
			$this->error               = $e->getMessage();
			$errors                    = (array) get_post_meta( $this->post->ID, self::META_ERROR, true );
			$errors[ $this->campaign ] = $e->getMessage();
			update_post_meta( $this->post->ID, self::META_ERROR, $errors );
			return false;
		}
	}
}
