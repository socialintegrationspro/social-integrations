<?php
/**
 * Auto-post campaigns: share new posts when they are published.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Campaigns;

use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Content\ShareBuilder;
use SocialIntegrations\Database\Migrations;
use SocialIntegrations\Hooks;
use SocialIntegrations\Support\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * An auto-post campaign shares each new post of its post types to its accounts, a set
 * time after the post is published, with its own caption and media. A post that
 * matches several campaigns goes to each account once, from the first of them.
 *
 * Data: [ 'active' => bool, 'post_types' => string[], 'accounts' => string[] (empty:
 * every account), 'delay' => [ 'value' => int, 'unit' => 'minutes'|'hours'|'days' ],
 * 'caption', 'captions', 'media', 'custom_media' ].
 */
final class Auto {

	const UNITS = array(
		'minutes' => MINUTE_IN_SECONDS,
		'hours'   => HOUR_IN_SECONDS,
		'days'    => DAY_IN_SECONDS,
	);

	/**
	 * Sanitizes an auto-post campaign the admin app sends.
	 *
	 * @param array $input Raw campaign.
	 */
	public static function clean( array $input ): array {
		$types = array_values( array_intersect( array_map( 'sanitize_key', (array) ( $input['post_types'] ?? array() ) ), PostTypes::names() ) );
		$delay = (array) ( $input['delay'] ?? array() );
		$unit  = (string) ( $delay['unit'] ?? 'minutes' );
		return array(
			'name'       => mb_substr( sanitize_text_field( (string) ( $input['name'] ?? '' ) ), 0, 191 ),
			'active'     => ! isset( $input['active'] ) || ! empty( $input['active'] ),
			'post_types' => $types ? $types : array( 'post' ),
			'accounts'   => array_values( array_filter( array_map( 'sanitize_key', (array) ( $input['accounts'] ?? array() ) ) ) ),
			'delay'      => array(
				'value' => max( 0, min( 365, (int) ( $delay['value'] ?? 0 ) ) ),
				'unit'  => isset( self::UNITS[ $unit ] ) ? $unit : 'minutes',
			),
		) + ShareBuilder::clean_template( $input );
	}

	/**
	 * A name for a campaign without one: its post types.
	 *
	 * @param array $data Clean campaign.
	 */
	private static function name( array $data ): string {
		if ( '' !== $data['name'] ) {
			return $data['name'];
		}
		$labels = array();
		$all    = PostTypes::all();
		foreach ( $data['post_types'] as $type ) {
			$labels[] = $all[ $type ]['label'] ?? $type;
		}
		/* translators: %s: post type names, such as "Posts, Pages". */
		return sprintf( __( 'New %s', 'social-integrations' ), implode( ', ', $labels ) );
	}

	/**
	 * Adds or updates an auto-post campaign.
	 *
	 * @param array $input Raw campaign.
	 * @param int   $id    Campaign ID to update, or 0 to add one.
	 * @return array|null The saved campaign, or null when $id is not an auto-post campaign.
	 */
	public static function save( array $input, int $id = 0 ): ?array {
		global $wpdb;
		$data = self::clean( $input );
		$now  = current_time( 'mysql', true );
		$row  = array(
			'name'       => self::name( $data ),
			'data'       => wp_json_encode( $data ),
			'updated_at' => $now,
		);
		if ( $id ) {
			$current = Campaigns::get( $id );
			if ( ! $current || 'auto' !== $current['type'] ) {
				return null;
			}
			$wpdb->update( Migrations::campaigns_table(), $row, array( 'id' => $id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		} else {
			$id = Campaigns::insert( 'auto', $row['name'], $data );
		}
		return Campaigns::get( $id );
	}

	/**
	 * Activates or deactivates a campaign.
	 *
	 * @param int  $id     Campaign ID.
	 * @param bool $active True to activate.
	 * @return array|\WP_Error|null The campaign, an error when it has no accounts, or null when there is no such campaign.
	 */
	public static function set_active( int $id, bool $active ) {
		$campaign = Campaigns::get( $id );
		if ( ! $campaign || 'auto' !== $campaign['type'] ) {
			return null;
		}
		// Its last account was disconnected. An empty list shares to every account, so the user selects accounts first.
		if ( $active && ! empty( $campaign['no_accounts'] ) ) {
			return new \WP_Error( 'sint_no_accounts', __( 'This campaign has no accounts. Edit the campaign and select an account.', 'social-integrations' ), array( 'status' => 409 ) );
		}
		$campaign['active'] = $active;
		return self::save( $campaign, $id );
	}

	/**
	 * Every auto-post campaign, oldest first, so the oldest campaign gets an account first.
	 *
	 * @return array[]
	 */
	public static function all(): array {
		global $wpdb;
		$table = Migrations::campaigns_table();
		$ids   = $wpdb->get_col( "SELECT id FROM {$table} WHERE type = 'auto' ORDER BY id ASC" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$out   = array();
		foreach ( $ids as $id ) {
			$campaign = Campaigns::get( (int) $id );
			if ( $campaign ) {
				$out[] = $campaign + self::clean( array() );
			}
		}
		return $out;
	}

	/**
	 * Whether any active campaign shares this post type.
	 *
	 * @param string $type Post type.
	 */
	public static function covers( string $type ): bool {
		foreach ( self::all() as $campaign ) {
			if ( $campaign['active'] && in_array( $type, $campaign['post_types'], true ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Active campaigns that share a post.
	 *
	 * @param \WP_Post $post Post.
	 * @return array[]
	 */
	public static function matching( \WP_Post $post ): array {
		$out = array();
		foreach ( self::all() as $campaign ) {
			if ( ! $campaign['active'] || ! in_array( $post->post_type, $campaign['post_types'], true ) ) {
				continue;
			}
			if ( apply_filters( Hooks::AUTO_CAMPAIGN_MATCHES, true, $post, $campaign ) ) {
				$out[] = $campaign;
			}
		}
		return $out;
	}

	/**
	 * Seconds from publish to share.
	 *
	 * @param array $campaign Campaign.
	 */
	public static function delay( array $campaign ): int {
		$delay = (array) ( $campaign['delay'] ?? array() );
		return (int) ( $delay['value'] ?? 0 ) * ( self::UNITS[ $delay['unit'] ?? 'minutes' ] ?? MINUTE_IN_SECONDS );
	}

	/**
	 * Changes the per post type rules of version 2 into auto-post campaigns, one time.
	 */
	public static function migrate(): void {
		$settings = get_option( Settings::OPTION, array() );
		if ( ! is_array( $settings ) || empty( $settings['post_types'] ) || ! is_array( $settings['post_types'] ) ) {
			return;
		}
		foreach ( $settings['post_types'] as $type => $rule ) {
			if ( ! is_array( $rule ) || empty( $rule['auto'] ) || ! post_type_exists( (string) $type ) ) {
				continue;
			}
			$seconds = (int) ( $rule['delay'] ?? 0 );
			self::save(
				array(
					'post_types'   => array( (string) $type ),
					'accounts'     => (array) ( $rule['accounts'] ?? array() ),
					'delay'        => $seconds >= HOUR_IN_SECONDS && 0 === $seconds % HOUR_IN_SECONDS
						? array(
							'value' => $seconds / HOUR_IN_SECONDS,
							'unit'  => 'hours',
						)
						: array(
							'value' => (int) floor( $seconds / MINUTE_IN_SECONDS ),
							'unit'  => 'minutes',
						),
					'caption'      => (string) ( $rule['template'] ?? '' ),
					'captions'     => (array) ( $rule['captions'] ?? array() ),
					'media'        => (string) ( $rule['media'] ?? 'auto' ),
					'custom_media' => (array) ( $rule['custom_media'] ?? array() ),
				)
			);
		}
		unset( $settings['post_types'] );
		update_option( Settings::OPTION, $settings, false );
	}
}
