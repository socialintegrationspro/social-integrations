<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use Brain\Monkey\Functions;
use SocialIntegrations\Templates\TemplateParser;
use SocialIntegrations\Tests\TestCase;

final class TemplateParserTest extends TestCase {

	/** @var \WP_Post */
	private $post;

	protected function setUp(): void {
		parent::setUp();
		$this->post = new \WP_Post( array( 'ID' => 7 ) );
		// Another test mocks ACF, so its functions exist. Here ACF knows no field.
		Functions\when( 'get_field_object' )->justReturn( false );
		// A post has tags; categories have levels, so they are not hashtags.
		Functions\when( 'get_object_taxonomies' )->justReturn(
			array(
				(object) array( 'name' => 'category', 'hierarchical' => true, 'public' => true ),
				(object) array( 'name' => 'post_tag', 'hierarchical' => false, 'public' => true ),
				(object) array( 'name' => 'post_format', 'hierarchical' => false, 'public' => true ),
			)
		);
	}

	public function test_render_replaces_tokens(): void {
		$out = ( new TemplateParser() )->render(
			"{title}\n\n{url} {tags}",
			$this->post,
			array(
				'title' => 'Hello',
				'url'   => 'https://example.com/hello',
				'tags'  => '#News',
			)
		);

		$this->assertSame( "Hello\n\nhttps://example.com/hello #News", $out );
	}

	public function test_render_reads_custom_fields_as_text(): void {
		Functions\expect( 'get_post_meta' )
			->twice()
			->andReturnUsing(
				static function ( $id, $key ) {
					return 'price' === $key ? 19 : array( 'red', 'blue' );
				}
			);

		$out = ( new TemplateParser() )->render( 'Only {field:price} ({field:colors})', $this->post, array() );

		$this->assertSame( 'Only 19 (red, blue)', $out );
	}

	public function test_render_applies_modifiers(): void {
		Functions\when( 'get_post_meta' )->justReturn( '' );

		$out = ( new TemplateParser() )->render(
			"{title|upper} {excerpt|words:2} {field:venue|default:Online}",
			$this->post,
			array(
				'title'   => 'Trail run',
				'excerpt' => 'Light trail shoes',
			)
		);

		$this->assertSame( 'TRAIL RUN Light trail… Online', $out );
	}

	public function test_render_fills_each_token_one_time(): void {
		$out = ( new TemplateParser() )->render(
			'{excerpt} {url}',
			$this->post,
			array(
				'excerpt' => 'Use {url} here',
				'url'     => 'https://example.com',
			)
		);

		$this->assertSame( 'Use {url} here https://example.com', $out );
	}

	public function test_double_brace_shows_a_token_as_text(): void {
		$out = ( new TemplateParser() )->render( 'Type {{title}} in the caption', $this->post, array( 'title' => 'Hello' ) );

		$this->assertSame( 'Type {title} in the caption', $out );
	}

	public function test_style_marks_pass_through_and_a_value_cannot_add_one(): void {
		$out = ( new TemplateParser() )->render( '{b}{title}{/b} {{b}}', $this->post, array( 'title' => 'A {b} title' ) );

		$this->assertSame( '{b}A {{b}} title{/b} {{b}}', $out );
	}

	public function test_a_filter_token_with_another_name_still_fills(): void {
		$out = ( new TemplateParser() )->render( 'On {event-date}', $this->post, array( 'event-date' => 'Nov 7' ) );

		$this->assertSame( 'On Nov 7', $out );
	}

	public function test_render_removes_the_lines_of_empty_tokens(): void {
		$out = ( new TemplateParser() )->render(
			"{title}\n\n{excerpt}\n\n{url}\n",
			$this->post,
			array(
				'title'   => 'A',
				'excerpt' => '',
				'url'     => 'B',
			)
		);

		$this->assertSame( "A\n\nB", $out );
	}

	public function test_unknown_tokens_stay(): void {
		$this->assertSame( '{nope}', ( new TemplateParser() )->render( '{nope}', $this->post, array() ) );
	}

	public function test_hashtags_from_post_tags(): void {
		Functions\expect( 'get_the_terms' )->once()->with( $this->post, 'post_tag' )->andReturn(
			array(
				(object) array( 'name' => 'word press' ),
				(object) array( 'name' => 'café-bar' ),
				(object) array( 'name' => 'élan vital' ),
				(object) array( 'name' => 'WordPress_tips' ),
				(object) array( 'name' => '!!!' ),
			)
		);

		$this->assertSame( '#WordPress #CaféBar #ÉlanVital #WordPressTips', $this->call( new TemplateParser(), 'hashtags', $this->post ) );
	}

	public function test_hashtags_from_the_tags_of_a_custom_post_type_without_duplicates(): void {
		Functions\when( 'get_object_taxonomies' )->justReturn(
			array(
				(object) array( 'name' => 'product_cat', 'hierarchical' => true, 'public' => true ),
				(object) array( 'name' => 'product_tag', 'hierarchical' => false, 'public' => true ),
				(object) array( 'name' => 'product_visibility', 'hierarchical' => false, 'public' => false ),
				(object) array( 'name' => 'brand', 'hierarchical' => false, 'public' => true ),
			)
		);
		Functions\when( 'get_the_terms' )->alias(
			static function ( $post, $taxonomy ) {
				return 'product_tag' === $taxonomy ? array( (object) array( 'name' => 'summer sale' ), (object) array( 'name' => 'shoes' ) ) : array( (object) array( 'name' => 'Shoes' ) );
			}
		);

		$product = new \WP_Post( array( 'ID' => 8, 'post_type' => 'product' ) );
		$this->assertSame( '#SummerSale #Shoes', $this->call( new TemplateParser(), 'hashtags', $product ) );
	}

	public function test_no_tags_gives_no_hashtags(): void {
		Functions\when( 'get_the_terms' )->justReturn( false );

		$this->assertSame( '', $this->call( new TemplateParser(), 'hashtags', $this->post ) );
	}
}
