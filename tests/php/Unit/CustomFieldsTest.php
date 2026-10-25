<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use Brain\Monkey\Functions;
use SocialIntegrations\Content\CustomFields;
use SocialIntegrations\Tests\TestCase;

final class CustomFieldsTest extends TestCase {

	public function test_text_of_values(): void {
		$this->assertSame( '19.9', CustomFields::text( 19.9 ) );
		$this->assertSame( 'Yes', CustomFields::text( true ) );
		$this->assertSame( 'No', CustomFields::text( false ) );
		$this->assertSame( 'Tom & Jerry', CustomFields::text( '<b>Tom &amp; Jerry</b>' ) );
		$this->assertSame( 'Red, Blue', CustomFields::text( array( 'Red', '', 'Blue' ) ) );
		// A choice with a label, a link, and a list of choices.
		$this->assertSame( 'Red', CustomFields::text( array( 'value' => 'red', 'label' => 'Red' ) ) );
		$this->assertSame( 'Tickets', CustomFields::text( array( 'url' => 'https://example.com', 'title' => 'Tickets', 'target' => '' ) ) );
		$this->assertSame( 'Red, Blue', CustomFields::text( array( array( 'value' => 'red', 'label' => 'Red' ), array( 'value' => 'blue', 'label' => 'Blue' ) ) ) );
		$this->assertSame( '', CustomFields::text( null ) );
	}

	public function test_value_without_acf_reads_post_meta(): void {
		Functions\when( 'get_field_object' )->justReturn( false );
		Functions\when( 'get_field' )->justReturn( 'not used' );
		Functions\expect( 'get_post_meta' )->once()->with( 7, 'venue', true )->andReturn( 'City Hall' );

		$this->assertSame( 'City Hall', CustomFields::value( new \WP_Post( array( 'ID' => 7 ) ), 'venue' ) );
	}

	public function test_value_with_acf_reads_the_formatted_field(): void {
		Functions\when( 'get_field_object' )->justReturn( array( 'key' => 'field_1', 'label' => 'Event date', 'type' => 'date_picker' ) );
		Functions\expect( 'get_field' )->once()->with( 'event_date', 7 )->andReturn( 'October 24, 2026' );

		$this->assertSame( 'October 24, 2026', CustomFields::value( new \WP_Post( array( 'ID' => 7 ) ), 'event_date' ) );
	}

	public function test_media_from_an_id_a_list_and_a_text_list(): void {
		Functions\when( 'get_post_meta' )->alias(
			static function ( $id, $key ) {
				$values = array(
					'photo'   => '12',
					'gallery' => array( 12, 15, 99 ),
					'images'  => '12,15',
					'title'   => 'Not media',
				);
				return $values[ $key ] ?? '';
			}
		);
		Functions\when( 'get_post_type' )->alias(
			static function ( $id ) {
				return in_array( (int) $id, array( 12, 15 ), true ) ? 'attachment' : 'post';
			}
		);
		Functions\when( 'get_post_mime_type' )->justReturn( 'image/jpeg' );
		Functions\when( 'wp_get_attachment_url' )->alias(
			static function ( $id ) {
				return "https://example.com/{$id}.jpg";
			}
		);
		Functions\when( 'wp_http_validate_url' )->justReturn( false );

		$post = new \WP_Post( array( 'ID' => 7 ) );
		$this->assertSame( array( 12 ), array_column( CustomFields::media( $post, 'photo' ), 'id' ) );
		$this->assertSame( array( 12, 15 ), array_column( CustomFields::media( $post, 'gallery' ), 'id' ), 'An ID that is not an attachment is left out.' );
		$this->assertSame( array( 12, 15 ), array_column( CustomFields::media( $post, 'images' ), 'id' ) );
		$this->assertSame( array(), CustomFields::media( $post, 'title' ) );
	}

	public function test_fields_of_a_post_type_without_internal_fields(): void {
		Functions\when( 'get_posts' )->justReturn( array( 7 ) );
		Functions\when( 'get_post' )->justReturn( new \WP_Post( array( 'ID' => 7 ) ) );
		Functions\when( 'get_field_object' )->justReturn( false );
		Functions\when( 'get_post_type' )->justReturn( 'post' );
		Functions\when( 'get_post_meta' )->alias(
			static function ( $id, $key = '', $single = false ) {
				$all = array(
					'event_date'     => array( '20261024' ),
					'_edit_lock'     => array( '1' ),
					'_sku'           => array( 'SHOE-1' ),
					'empty_field'    => array( '' ),
					'cover_image'    => array( '' ),
				);
				return '' === $key ? $all : ( $all[ $key ][0] ?? '' );
			}
		);
		Functions\when( 'apply_filters' )->returnArg( 2 );

		$fields = CustomFields::of_type( 'event' );

		$this->assertSame( array( 'event_date', '_sku' ), array_column( $fields, 'key' ) );
		$this->assertSame( 'Event date', $fields[0]['label'] );
		$this->assertSame( '20261024', $fields[0]['sample'] );
		$this->assertFalse( $fields[0]['media'] );
	}
}
