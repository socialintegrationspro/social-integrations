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

	public function test_render_reads_post_meta_fields(): void {
		Functions\expect( 'get_post_meta' )
			->twice()
			->andReturnUsing(
				static function ( $id, $key ) {
					return 'price' === $key ? 19 : array( 'not', 'scalar' );
				}
			);

		$out = ( new TemplateParser() )->render( 'Only {field:price} ({field:list})', $this->post, array() );

		$this->assertSame( 'Only 19 ()', $out );
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
		Functions\when( 'get_the_terms' )->justReturn(
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

	public function test_no_tags_gives_no_hashtags(): void {
		Functions\when( 'get_the_terms' )->justReturn( false );

		$this->assertSame( '', $this->call( new TemplateParser(), 'hashtags', $this->post ) );
	}
}
