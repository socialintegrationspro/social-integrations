<?php
/**
 * WooCommerce products.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Content;

defined( 'ABSPATH' ) || exit;

/**
 * Price tokens and gallery images of a WooCommerce product. Without WooCommerce, a post has none.
 */
final class Products {

	/**
	 * Tokens that a product adds to a caption template.
	 */
	const TOKENS = array( 'price', 'regular_price', 'sale_price' );

	/**
	 * The product of a post, or null.
	 *
	 * @param \WP_Post $post Post.
	 * @return \WC_Product|null
	 */
	private static function product( \WP_Post $post ) {
		if ( 'product' !== $post->post_type || ! function_exists( 'wc_get_product' ) ) {
			return null;
		}
		$product = wc_get_product( $post->ID );
		return $product ? $product : null;
	}

	/**
	 * Price tokens with the currency of the shop, such as '$19.90'. A product without a sale has an empty {sale_price}.
	 *
	 * @param \WP_Post $post Post.
	 * @return array<string, string>
	 */
	public static function tokens( \WP_Post $post ): array {
		$product = self::product( $post );
		if ( ! $product ) {
			return array();
		}
		$money = static function ( $amount ): string {
			return '' === (string) $amount ? '' : html_entity_decode( wp_strip_all_tags( wc_price( (float) $amount ) ), ENT_QUOTES, 'UTF-8' );
		};
		// A variable product has a price range; {price} is its lowest price.
		return array(
			'price'         => $money( $product->get_price() ),
			'regular_price' => $money( $product->get_regular_price() ),
			'sale_price'    => $product->is_on_sale() ? $money( $product->get_sale_price() ) : '',
		);
	}

	/**
	 * The gallery images of a product, after its main image.
	 *
	 * @param \WP_Post $post Post.
	 * @return array<int, array> Media items.
	 */
	public static function gallery( \WP_Post $post ): array {
		$product = self::product( $post );
		if ( ! $product ) {
			return array();
		}
		$items = array();
		foreach ( $product->get_gallery_image_ids() as $id ) {
			$item = ShareBuilder::attachment( (int) $id );
			if ( $item ) {
				$items[] = $item;
			}
		}
		return $items;
	}
}
