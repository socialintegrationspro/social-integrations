<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use Brain\Monkey\Functions;
use SocialIntegrations\Content\Products;
use SocialIntegrations\Tests\TestCase;

final class ProductsTest extends TestCase {

	private function product( bool $on_sale ): void {
		$product = \Mockery::mock();
		$product->shouldReceive( 'get_price' )->andReturn( $on_sale ? '15' : '20' );
		$product->shouldReceive( 'get_regular_price' )->andReturn( '20' );
		$product->shouldReceive( 'get_sale_price' )->andReturn( $on_sale ? '15' : '' );
		$product->shouldReceive( 'is_on_sale' )->andReturn( $on_sale );
		$product->shouldReceive( 'get_gallery_image_ids' )->andReturn( array( 31, 32 ) );
		Functions\when( 'wc_get_product' )->justReturn( $product );
		Functions\when( 'wc_price' )->alias(
			static function ( $amount ) {
				return '<span class="amount">&#36;' . number_format( (float) $amount, 2 ) . '</span>';
			}
		);
	}

	public function test_price_tokens_with_the_currency(): void {
		$this->product( true );

		$tokens = Products::tokens( new \WP_Post( array( 'ID' => 5, 'post_type' => 'product' ) ) );

		$this->assertSame( array( 'price' => '$15.00', 'regular_price' => '$20.00', 'sale_price' => '$15.00' ), $tokens );
	}

	public function test_a_product_without_a_sale_has_an_empty_sale_price(): void {
		$this->product( false );

		$tokens = Products::tokens( new \WP_Post( array( 'ID' => 5, 'post_type' => 'product' ) ) );

		$this->assertSame( '$20.00', $tokens['price'] );
		$this->assertSame( '', $tokens['sale_price'] );
	}

	public function test_a_post_that_is_not_a_product_has_no_price_or_gallery(): void {
		$this->product( true );
		$post = new \WP_Post( array( 'ID' => 5 ) );

		$this->assertSame( array(), Products::tokens( $post ) );
		$this->assertSame( array(), Products::gallery( $post ) );
	}

	public function test_gallery_images_of_a_product(): void {
		$this->product( false );
		Functions\when( 'get_post_mime_type' )->justReturn( 'image/png' );
		Functions\when( 'wp_get_attachment_url' )->alias(
			static function ( $id ) {
				return "https://shop.example/{$id}.png";
			}
		);
		Functions\when( 'get_post_meta' )->justReturn( '' );

		$gallery = Products::gallery( new \WP_Post( array( 'ID' => 5, 'post_type' => 'product' ) ) );

		$this->assertSame( array( 31, 32 ), array_column( $gallery, 'id' ) );
	}
}
