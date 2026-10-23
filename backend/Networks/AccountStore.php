<?php
/**
 * Where the plugin keeps connected accounts.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

defined( 'ABSPATH' ) || exit;

/**
 * Storage behind Accounts. The `sint/account_store` filter can supply another one.
 */
interface AccountStore {

	/**
	 * Stored accounts keyed by ID, with encrypted credentials.
	 *
	 * @return array<string, array>
	 */
	public function load(): array;

	/**
	 * Saves the full set, as load() returns it.
	 *
	 * @param array<string, array> $accounts Accounts keyed by ID.
	 */
	public function persist( array $accounts ): void;

	/**
	 * The ID that the store saves a connected account under. An ID already in $accounts replaces
	 * that account.
	 *
	 * @param string               $network   Network key.
	 * @param string               $remote_id The account's ID on the network.
	 * @param array<string, array> $accounts  Current accounts.
	 */
	public function id_for( string $network, string $remote_id, array $accounts ): string;
}
