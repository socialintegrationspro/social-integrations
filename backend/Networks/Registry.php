<?php
/**
 * Network registry.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

use SocialIntegrations\Hooks;

defined( 'ABSPATH' ) || exit;

/**
 * Builds the list of networks from the `sint/network_classes` filter.
 */
final class Registry {

	/**
	 * Networks keyed by key(). Built on first use, so filters added on `init` count.
	 *
	 * @var AbstractNetwork[]|null
	 */
	private $networks = null;

	/**
	 * All networks.
	 *
	 * @return AbstractNetwork[]
	 */
	public function all(): array {
		if ( null === $this->networks ) {
			$this->networks = array();
			$classes        = apply_filters(
				Hooks::NETWORK_CLASSES,
				array( Facebook::class, LinkedIn::class )
			);
			foreach ( (array) $classes as $class_name ) {
				if ( is_string( $class_name ) && class_exists( $class_name ) && is_subclass_of( $class_name, AbstractNetwork::class ) ) {
					$network                           = new $class_name();
					$this->networks[ $network->key() ] = $network;
				}
			}
		}
		return $this->networks;
	}

	/**
	 * One network, or null.
	 *
	 * @param string $key Network key.
	 */
	public function get( string $key ): ?AbstractNetwork {
		$all = $this->all();
		return $all[ $key ] ?? null;
	}
}
