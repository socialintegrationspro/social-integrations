<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use Brain\Monkey\Functions;
use SocialIntegrations\Content\BlockParser;
use SocialIntegrations\Support\Settings;
use SocialIntegrations\Tests\TestCase;

final class BlockParserTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'has_blocks' )->justReturn( true );
		Functions\when( 'wp_get_attachment_url' )->justReturn( '' );
		Functions\when( 'get_post_meta' )->justReturn( '' );
	}

	private static function block( string $name, string $html = '', array $attrs = array(), array $inner = array() ): array {
		return array(
			'blockName'   => $name,
			'attrs'       => $attrs,
			'innerHTML'   => $html,
			'innerBlocks' => $inner,
		);
	}

	private function parse( array $blocks ): array {
		Functions\when( 'parse_blocks' )->justReturn( $blocks );
		return ( new BlockParser() )->parse( new \WP_Post( array( 'post_content' => '<!-- wp:x -->' ) ) );
	}

	public function test_default_rules(): void {
		$out = $this->parse(
			array(
				self::block( 'core/heading', '<h2>Skip me</h2>' ),
				self::block( 'core/paragraph', '<p>First &amp; best</p>' ),
				self::block( 'core/list', '<ul><li>One</li><li>Two</li></ul>' ),
				self::block( 'core/html', '<p>Never</p>' ),
				self::block( 'core/embed', '', array( 'url' => 'https://video.example.com/1' ) ),
				self::block( 'core/image', '<figure><img src="https://example.com/a.jpg" alt="An &quot;A&quot;"></figure>' ),
				array( 'blockName' => null ),
			)
		);

		$this->assertSame( 'First & best', $out['excerpt'] );
		$this->assertSame( "One\nTwo", $out['text'] );
		$this->assertSame( array( 'https://video.example.com/1' ), $out['links'] );
		$this->assertSame(
			array(
				array(
					'type'  => 'image',
					'id'    => 0,
					'url'   => 'https://example.com/a.jpg',
					'alt'   => 'An "A"',
					'first' => false,
				),
			),
			$out['media']
		);
		$this->assertSame( array( 'core/heading', 'core/paragraph', 'core/list', 'core/html', 'core/embed', 'core/image' ), array_column( $out['blocks'], 'name' ) );
	}

	public function test_block_attribute_overrides_the_rule_and_puts_media_first(): void {
		$out = $this->parse(
			array(
				self::block( 'core/image', '<img src="https://example.com/1.jpg">' ),
				self::block( 'core/image', '<img src="https://example.com/2.jpg">', array( 'sintSocial' => array( 'first' => true ) ) ),
				self::block( 'core/paragraph', '<p>Body</p>', array( 'sintSocial' => array( 'use' => 'text' ) ) ),
				self::block( 'core/image', '<img src="https://example.com/3.jpg">', array( 'sintSocial' => array( 'use' => 'remove' ) ) ),
			)
		);

		$this->assertSame( array( 'https://example.com/2.jpg', 'https://example.com/1.jpg' ), array_column( $out['media'], 'url' ) );
		$this->assertSame( 'Body', $out['text'] );
		$this->assertSame( '', $out['excerpt'] );
		$this->assertSame( 'skip', $out['blocks'][3]['use'], 'The old name remove shows as skip.' );
	}

	public function test_block_attribute_counts_only_when_allowed(): void {
		Functions\when( 'get_option' )->justReturn( array( 'allow_block_override' => false ) );

		$out = $this->parse( array( self::block( 'core/paragraph', '<p>Body</p>', array( 'sintSocial' => array( 'use' => 'remove' ) ) ) ) );

		$this->assertSame( 'Body', $out['excerpt'] );
	}

	public function test_containers_pass_into_inner_blocks(): void {
		$out = $this->parse(
			array(
				self::block( 'core/group', '', array(), array( self::block( 'core/list', '<li>In group</li>' ) ) ),
				self::block( 'core/gallery', '', array(), array( self::block( 'core/image', '<img src="https://example.com/g.jpg">' ) ) ),
			)
		);

		$this->assertSame( 'In group', $out['text'] );
		$this->assertSame( array( 'https://example.com/g.jpg' ), array_column( $out['media'], 'url' ) );
	}

	public function test_attachment_ids_read_the_media_library(): void {
		Functions\when( 'wp_get_attachment_url' )->justReturn( 'https://example.com/lib.mp4' );
		Functions\when( 'get_post_meta' )->justReturn( 'Library alt' );

		$out = $this->parse( array( self::block( 'core/video', '<video src="x"></video>', array( 'id' => 5 ) ) ) );

		$this->assertSame( 'video', $out['media'][0]['type'] );
		$this->assertSame( 5, $out['media'][0]['id'] );
		$this->assertSame( 'https://example.com/lib.mp4', $out['media'][0]['url'] );
		$this->assertSame( 'Library alt', $out['media'][0]['alt'] );
	}

	public function test_classic_content_becomes_the_excerpt(): void {
		Functions\when( 'has_blocks' )->justReturn( false );

		$out = ( new BlockParser() )->parse( new \WP_Post( array( 'post_content' => '<p>Classic [gallery] text</p>' ) ) );

		$this->assertSame( 'Classic text', $out['excerpt'] );
		$this->assertSame( '', $out['text'] );
	}

	public function test_block_uses_list_matches_settings(): void {
		// Posts can still have the old name in a block attribute.
		$this->assertContains( 'remove', Settings::BLOCK_USES );
		$this->assertSame( 'skip', Settings::block_use( 'remove' ) );
		$this->assertSame( 'text', Settings::block_use( 'text' ) );
	}
}
