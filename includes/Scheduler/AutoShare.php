<?php
/**
 * Shares a post when it is first published.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Scheduler;

use SocialIntegrations\Content\ShareBuilder;
use SocialIntegrations\Networks\Accounts;

defined( 'ABSPATH' ) || exit;

/**
 * Adds queue rows on the first publish of a post type with auto-share on.
 * Updates to a published post never share again.
 */
final class AutoShare {

	const META_SHARED   = '_sint_auto_shared';
	const META_DISABLED = '_sint_disabled';
	const META_ACCOUNTS = '_sint_accounts';
	const CRON_HOOK     = 'sint_auto_share_post';

	/**
	 * Registers the hook.
	 */
	public function register(): void {
		add_action( 'transition_post_status', array( $this, 'on_transition' ), 10, 3 );
		add_action( self::CRON_HOOK, array( $this, 'queue_post' ) );
	}

	/**
	 * Handles a status change.
	 *
	 * @param string   $new_status New status.
	 * @param string   $old_status Old status.
	 * @param \WP_Post $post       Post.
	 */
	public function on_transition( string $new_status, string $old_status, \WP_Post $post ): void {
		if ( 'publish' !== $new_status || 'publish' === $old_status ) {
			return;
		}
		if ( wp_is_post_revision( $post ) || wp_is_post_autosave( $post ) || ! empty( $post->post_password ) ) {
			return;
		}
		if ( get_post_meta( $post->ID, self::META_SHARED, true ) || get_post_meta( $post->ID, self::META_DISABLED, true ) ) {
			return;
		}

		$builder = new ShareBuilder();
		$rule    = $builder->rule( $post->post_type );
		if ( empty( $rule['auto'] ) ) {
			return;
		}

		// Block editor saves post meta in a second request; the delay lets that finish.
		$delay = max( 0, (int) ( $rule['delay'] ?? 15 ) );
		update_post_meta( $post->ID, self::META_SHARED, time() );

		wp_schedule_single_event( time() + $delay, self::CRON_HOOK, array( $post->ID ) );
	}

	/**
	 * Builds the share and adds one queue row for each account.
	 *
	 * @param int $post_id Post ID.
	 */
	public function queue_post( int $post_id ): void {
		$post = get_post( $post_id );
		if ( ! $post || 'publish' !== $post->post_status || get_post_meta( $post_id, self::META_DISABLED, true ) ) {
			return;
		}

		$builder  = new ShareBuilder();
		$share    = $builder->build( $post );
		$rule     = $builder->rule( $post->post_type );
		$selected = get_post_meta( $post_id, self::META_ACCOUNTS, true );
		$selected = is_array( $selected ) && $selected ? $selected : (array) ( $rule['accounts'] ?? array() );

		foreach ( Accounts::all() as $account ) {
			if ( 'connected' !== ( $account['status'] ?? '' ) ) {
				continue;
			}
			if ( $selected && ! in_array( $account['id'], $selected, true ) ) {
				continue;
			}
			Queue::add(
				array(
					'post_id'      => $post_id,
					'network'      => $account['network'],
					'account_id'   => $account['id'],
					'caption'      => $share['caption'],
					'media'        => $share['media'],
					'link'         => $share['link'],
					'status'       => 'scheduled',
					'scheduled_at' => current_time( 'mysql', true ),
				)
			);
		}
		Publisher::wake_at( time() );
	}
}
