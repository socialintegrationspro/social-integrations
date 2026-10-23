<?php
/**
 * Dashboard route.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Rest;

use SocialIntegrations\Campaigns\Campaigns;
use SocialIntegrations\Content\PostTypes;
use SocialIntegrations\Hooks;
use SocialIntegrations\Networks\Accounts;
use SocialIntegrations\Scheduler\Queue;
use SocialIntegrations\Support\Capabilities;
use SocialIntegrations\Support\Dates;

defined( 'ABSPATH' ) || exit;

/**
 * A summary of all sharing activity for the Dashboard screen.
 */
final class DashboardController extends RestController {

	/**
	 * Periods the screen can show, in days.
	 */
	const PERIODS = array( 7, 30 );

	/**
	 * Registers routes.
	 */
	public function register_routes(): void {
		$this->route(
			'/dashboard',
			\WP_REST_Server::READABLE,
			array( $this, 'index' ),
			array(
				'days' => array(
					'type'    => 'integer',
					'enum'    => self::PERIODS,
					'default' => 7,
				),
			),
			Capabilities::VIEW
		);
	}

	/**
	 * Counts for each day of the period and of the period before it, shares by network,
	 * the next scheduled shares and the newest log rows.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public function index( \WP_REST_Request $request ): \WP_REST_Response {
		$days   = in_array( (int) $request['days'], self::PERIODS, true ) ? (int) $request['days'] : 7;
		$zone   = wp_timezone();
		$today  = new \DateTimeImmutable( 'today', $zone );
		$offset = $zone->getOffset( new \DateTimeImmutable( 'now', $zone ) );

		// The period before this one gives the trend, so read both.
		$start = $today->modify( '-' . ( 2 * $days - 1 ) . ' days' );
		$from  = $start->setTimezone( new \DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );
		$split = $today->modify( '-' . ( $days - 1 ) . ' days' )->format( 'Y-m-d' );

		$accounts = Accounts::allowed();
		$by_day   = array();
		$networks = array();
		$totals   = array(
			'published'          => 0,
			'failed'             => 0,
			'previous_published' => 0,
			'previous_failed'    => 0,
		);
		for ( $i = $days - 1; $i >= 0; $i-- ) {
			$by_day[ $today->modify( "-{$i} days" )->format( 'Y-m-d' ) ] = array(
				'published' => 0,
				'failed'    => 0,
			);
		}
		foreach ( Queue::activity( $from, $offset, $accounts ) as $row ) {
			$n      = (int) $row['n'];
			$status = (string) $row['status'];
			if ( $row['day'] < $split ) {
				$totals[ "previous_{$status}" ] += $n;
				continue;
			}
			$totals[ $status ] += $n;
			if ( isset( $by_day[ $row['day'] ] ) ) {
				$by_day[ $row['day'] ][ $status ] += $n;
			}
			$network = (string) $row['network'];
			if ( ! isset( $networks[ $network ] ) ) {
				$networks[ $network ] = array(
					'network'   => $network,
					'published' => 0,
					'failed'    => 0,
				);
			}
			$networks[ $network ][ $status ] += $n;
		}
		usort(
			$networks,
			static function ( array $a, array $b ): int {
				return ( $b['published'] + $b['failed'] ) <=> ( $a['published'] + $a['failed'] );
			}
		);

		$counts    = Queue::status_counts( $accounts );
		$campaigns = Campaigns::visible_all();

		return rest_ensure_response(
			array(
				'days'      => array_map(
					static function ( string $date, array $n ): array {
						return array( 'date' => $date ) + $n;
					},
					array_keys( $by_day ),
					array_values( $by_day )
				),
				'totals'    => $totals + array(
					'scheduled' => $counts['scheduled'],
					'drafts'    => $counts['draft'],
				),
				'networks'  => array_values( $networks ),
				'campaigns' => array(
					'active' => count(
						array_filter(
							$campaigns,
							static function ( array $c ): bool {
								return 'active' === ( $c['status'] ?? '' );
							}
						)
					),
					'total'  => count( $campaigns ),
				),
				'upcoming'  => $this->upcoming( $accounts ),
				'recent'    => array_map(
					function ( array $row ): array {
						return array(
							'id'         => (int) $row['id'],
							'network'    => (string) $row['network'],
							'account_id' => (string) $row['account_id'],
							'status'     => (string) $row['status'],
							'message'    => (string) $row['message'],
							'remote_url' => (string) $row['remote_url'],
							'title'      => $this->title( (int) $row['post_id'], '' ),
							'created_at' => Dates::iso( (string) $row['created_at'] ),
						);
					},
					Queue::recent_logs( 8, $accounts )
				),
			)
		);
	}

	/**
	 * The next shares: queued ones, and planned ones that other plugins add.
	 *
	 * @param string[]|null $accounts Only shares of these accounts. Null: every account.
	 */
	private function upcoming( ?array $accounts ): array {
		$limit  = 6;
		$shares = array_map(
			function ( array $row ): array {
				return array(
					'id'           => $row['id'],
					'network'      => $row['network'],
					'account_id'   => $row['account_id'],
					'title'        => $this->title( $row['post_id'], (string) $row['caption'] ),
					'scheduled_at' => Dates::iso( $row['scheduled_at'] ),
				);
			},
			Queue::upcoming( $limit, $accounts )
		);
		$shares = array_values(
			array_filter(
				(array) apply_filters( Hooks::UPCOMING_SHARES, $shares ),
				static function ( $share ) use ( $accounts ): bool {
					return is_array( $share ) && ( null === $accounts || in_array( (string) ( $share['account_id'] ?? '' ), $accounts, true ) );
				}
			)
		);
		usort(
			$shares,
			static function ( array $a, array $b ): int {
				return strtotime( (string) ( $a['scheduled_at'] ?? '' ) ) <=> strtotime( (string) ( $b['scheduled_at'] ?? '' ) );
			}
		);
		return array_slice( $shares, 0, $limit );
	}

	/**
	 * A short name for a share: its post title, else the start of its caption.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $caption Caption.
	 */
	private function title( int $post_id, string $caption ): string {
		$post = $post_id ? get_post( $post_id ) : null;
		if ( $post ) {
			return PostTypes::title( $post );
		}
		return wp_html_excerpt( trim( (string) preg_replace( '/\s+/', ' ', $caption ) ), 80, '…' );
	}
}
