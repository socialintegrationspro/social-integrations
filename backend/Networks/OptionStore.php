<?php
/**
 * The plugin's own account storage: one account for each network.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

defined( 'ABSPATH' ) || exit;

/**
 * Keeps accounts in one option, keyed by network, so connecting a network again
 * replaces its account.
 */
final class OptionStore implements AccountStore {

	/**
	 * {@inheritDoc}
	 */
	public function load(): array {
		$stored = get_option( Accounts::OPTION, array() );
		return is_array( $stored ) ? $stored : array();
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param array<string, array> $accounts Accounts keyed by ID.
	 */
	public function persist( array $accounts ): void {
		update_option( Accounts::OPTION, $accounts, false );
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param string               $network   Network key.
	 * @param string               $remote_id The profile's ID on the network.
	 * @param array<string, array> $accounts  Current accounts.
	 */
	public function id_for( string $network, string $remote_id, array $accounts ): string { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed
		return $network;
	}
}
