<?php
/**
 * Shares a post when it is first published.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Scheduler;

use SocialIntegrations\Campaigns\Auto;
use SocialIntegrations\Content\ShareBuilder;
use SocialIntegrations\Hooks;
use SocialIntegrations\Networks\Accounts;

defined( 'ABSPATH' ) || exit;

/**
 * Adds queue rows on the first publish of a post that an auto-post campaign shares.
 * Updates to a published post never share again.
 */
final class AutoShare {

	const META_SHARED   = '_sint_auto_shared';
	const META_DISABLED = '_sint_disabled';
	const META_ACCOUNTS = '_sint_accounts';
	const CRON_HOOK     = 'sint_auto_share_post';

	/**
	 * The block editor saves post meta and terms in a second request; the shares are
	 * worked out this many seconds after publish, when those are saved.
	 */
	const SETTLE = 15;

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
		if ( ! Auto::covers( $post->post_type ) ) {
			return;
		}

		update_post_meta( $post->ID, self::META_SHARED, time() );
		wp_schedule_single_event( time() + self::SETTLE, self::CRON_HOOK, array( $post->ID ) );
	}

	/**
	 * Adds the post's shares for every campaign it matches, each at publish time plus the
	 * campaign's delay. An account gets the post once, from the first matching campaign.
	 *
	 * @param int $post_id Post ID.
	 */
	public function queue_post( int $post_id ): void {
		$post = get_post( $post_id );
		if ( ! $post || 'publish' !== $post->post_status || get_post_meta( $post_id, self::META_DISABLED, true ) ) {
			return;
		}

		// Accounts the editor chose for this post replace every campaign's accounts.
		$chosen    = get_post_meta( $post_id, self::META_ACCOUNTS, true );
		$chosen    = is_array( $chosen ) ? array_values( array_filter( $chosen ) ) : array();
		$published = (int) get_post_time( 'U', true, $post );
		$builder   = new ShareBuilder();
		$used      = array();

		foreach ( Auto::matching( $post ) as $campaign ) {
			$wanted  = $chosen ? $chosen : $campaign['accounts'];
			$when    = max( time(), $published + Auto::delay( $campaign ) );
			$batch   = Queue::batch();
			$created = array();
			foreach ( Accounts::all() as $account ) {
				if ( 'connected' !== ( $account['status'] ?? '' ) || isset( $used[ $account['id'] ] ) ) {
					continue;
				}
				if ( $wanted && ! in_array( $account['id'], $wanted, true ) ) {
					continue;
				}
				$share                  = $builder->build( $post, $account, 'auto', Auto::template( $campaign ) );
				$created[]              = Queue::add(
					array(
						'post_id'      => $post_id,
						'campaign_id'  => (int) $campaign['id'],
						'campaign_key' => 'auto-' . (int) $campaign['id'],
						'batch_id'     => $batch,
						'network'      => $account['network'],
						'account_id'   => $account['id'],
						'caption'      => $share['caption'],
						'media'        => $share['media'],
						'link'         => $share['link'],
						'status'       => 'scheduled',
						'scheduled_at' => gmdate( 'Y-m-d H:i:s', $when ),
					)
				);
				$used[ $account['id'] ] = true;
			}
			if ( ! $created ) {
				continue;
			}
			do_action(
				Hooks::SHARES_CREATED,
				$created,
				array(
					'source'   => 'auto',
					'campaign' => (int) $campaign['id'],
				)
			);
			Publisher::wake_at( $when );
		}
	}
}
