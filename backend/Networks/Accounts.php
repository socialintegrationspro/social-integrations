<?php
/**
 * Connected accounts.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

use SocialIntegrations\Hooks;
use SocialIntegrations\Support\Encryption;

defined( 'ABSPATH' ) || exit;

/**
 * Stores one account for each network in the `sint_accounts` option.
 * The plugin encrypts credentials and app secrets at rest. They never leave the server.
 */
final class Accounts {

	const OPTION     = 'sint_accounts';
	const APP_OPTION = 'sint_network_apps';

	/**
	 * All accounts, without credentials.
	 *
	 * @return array[]
	 */
	public static function all(): array {
		$accounts = array();
		foreach ( self::stored() as $account ) {
			unset( $account['credentials'] );
			$accounts[] = self::with_via( $account );
		}
		return apply_filters( Hooks::ACCOUNTS, $accounts );
	}

	/**
	 * The IDs of the accounts that a user can use, or null for every account.
	 *
	 * @param int $user_id User ID. Default: the current user.
	 * @return string[]|null
	 */
	public static function allowed( int $user_id = 0 ): ?array {
		$ids = apply_filters( Hooks::USER_ACCOUNTS, null, $user_id ? $user_id : get_current_user_id() );
		return is_array( $ids ) ? array_values( array_map( 'strval', $ids ) ) : null;
	}

	/**
	 * The accounts that the current user can use, without credentials.
	 *
	 * @return array[]
	 */
	public static function visible(): array {
		$allowed = self::allowed();
		if ( null === $allowed ) {
			return self::all();
		}
		return array_values(
			array_filter(
				self::all(),
				static function ( array $account ) use ( $allowed ): bool {
					return in_array( (string) $account['id'], $allowed, true );
				}
			)
		);
	}

	/**
	 * Whether the current user can use all of these accounts. For a user with a limit, an
	 * empty list, which means every account, is not allowed.
	 *
	 * @param string[] $ids Account IDs.
	 */
	public static function can_use( array $ids ): bool {
		$allowed = self::allowed();
		if ( null === $allowed ) {
			return true;
		}
		$ids = array_filter( array_map( 'strval', $ids ) );
		return $ids && ! array_diff( $ids, $allowed );
	}

	/**
	 * One account with decrypted credentials, or null.
	 *
	 * @param string $id Account ID.
	 */
	public static function get( string $id ): ?array {
		$stored = self::stored();
		if ( ! isset( $stored[ $id ] ) ) {
			return null;
		}
		$account                = self::with_via( $stored[ $id ] );
		$account['credentials'] = Encryption::decrypt_array( (array) ( $account['credentials'] ?? array() ) );
		return $account;
	}

	/**
	 * Saves a connected account. The store decides its ID; the account replaces an account with the same ID.
	 *
	 * @param string $network     Network key.
	 * @param array  $profile     ['remote_id', 'name', 'username', 'avatar', 'profile_url'].
	 * @param array  $credentials Plain credentials.
	 * @param string $via         How the account signed in: 'app' (own developer app), or another method.
	 * @return array The account, without credentials.
	 */
	public static function save( string $network, array $profile, array $credentials, string $via = 'app' ): array {
		$stored        = self::stored();
		$network       = sanitize_key( $network );
		$remote_id     = sanitize_text_field( (string) ( $profile['remote_id'] ?? '' ) );
		$id            = sanitize_key( self::store()->id_for( $network, $remote_id, $stored ) );
		$account       = array(
			'id'           => $id,
			'network'      => $network,
			'remote_id'    => $remote_id,
			'name'         => sanitize_text_field( (string) ( $profile['name'] ?? '' ) ),
			'username'     => sanitize_text_field( (string) ( $profile['username'] ?? '' ) ),
			'avatar'       => esc_url_raw( (string) ( $profile['avatar'] ?? '' ) ),
			'profile_url'  => esc_url_raw( (string) ( $profile['profile_url'] ?? '' ) ),
			'status'       => 'connected',
			'via'          => sanitize_key( $via ),
			'connected_at' => gmdate( 'c' ),
			'expires_at'   => isset( $credentials['expires_at'] ) ? gmdate( 'c', (int) $credentials['expires_at'] ) : null,
		);
		$stored[ $id ] = $account + array( 'credentials' => Encryption::encrypt_array( self::flatten( $credentials ) ) );
		self::store()->persist( $stored );
		return $account;
	}

	/**
	 * Replaces the credentials of an account, for example after a refresh.
	 *
	 * @param string $id          Account ID.
	 * @param array  $credentials Plain credentials.
	 */
	public static function update_credentials( string $id, array $credentials ): void {
		$stored = self::stored();
		if ( isset( $stored[ $id ] ) ) {
			$stored[ $id ]['credentials'] = Encryption::encrypt_array( self::flatten( $credentials ) );
			$stored[ $id ]['status']      = 'connected';
			$stored[ $id ]['expires_at']  = isset( $credentials['expires_at'] ) ? gmdate( 'c', (int) $credentials['expires_at'] ) : null;
			self::store()->persist( $stored );
		}
	}

	/**
	 * Sets the status of an account: 'connected' or 'expired'.
	 *
	 * @param string $id     Account ID.
	 * @param string $status Status.
	 */
	public static function set_status( string $id, string $status ): void {
		$stored = self::stored();
		if ( isset( $stored[ $id ] ) ) {
			$stored[ $id ]['status'] = $status;
			self::store()->persist( $stored );
		}
	}

	/**
	 * Removes an account.
	 *
	 * @param string $id Account ID.
	 */
	public static function delete( string $id ): bool {
		$stored = self::stored();
		if ( ! isset( $stored[ $id ] ) ) {
			return false;
		}
		unset( $stored[ $id ] );
		self::store()->persist( $stored );
		return true;
	}

	/**
	 * Decrypted app fields for an OAuth network.
	 *
	 * @param string $network Network key.
	 */
	public static function app( string $network ): array {
		$apps = get_option( self::APP_OPTION, array() );
		return isset( $apps[ $network ] ) ? Encryption::decrypt_array( (array) $apps[ $network ] ) : array();
	}

	/**
	 * Saves app fields for an OAuth network.
	 *
	 * @param string $network Network key.
	 * @param array  $fields  Plain fields.
	 */
	public static function save_app( string $network, array $fields ): void {
		$apps             = get_option( self::APP_OPTION, array() );
		$apps             = is_array( $apps ) ? $apps : array();
		$apps[ $network ] = Encryption::encrypt_array( array_map( 'sanitize_text_field', array_map( 'strval', $fields ) ) );
		update_option( self::APP_OPTION, $apps, false );
	}

	/**
	 * Whether the app fields of a network are complete.
	 *
	 * @param string $network Network key.
	 */
	public static function has_app( string $network ): bool {
		$app = self::app( $network );
		return ! empty( $app['client_id'] ) && ! empty( $app['client_secret'] );
	}

	/**
	 * An account with its sign-in method. Accounts saved before the method was stored used their own app.
	 *
	 * @param array $account Stored account.
	 */
	private static function with_via( array $account ): array {
		$account['via'] = (string) ( $account['via'] ?? 'app' );
		return $account;
	}

	/**
	 * Raw stored accounts.
	 */
	private static function stored(): array {
		return self::store()->load();
	}

	/**
	 * The account storage: the filtered one, or one account per network.
	 */
	private static function store(): AccountStore {
		$store = apply_filters( Hooks::ACCOUNT_STORE, null );
		return $store instanceof AccountStore ? $store : new OptionStore();
	}

	/**
	 * The plugin stores credentials as a flat map of strings; nested values become JSON.
	 *
	 * @param array $credentials Credentials.
	 */
	private static function flatten( array $credentials ): array {
		$flat = array();
		foreach ( $credentials as $key => $value ) {
			$flat[ $key ] = is_scalar( $value ) ? (string) $value : (string) wp_json_encode( $value );
		}
		return $flat;
	}
}
