<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use SocialIntegrations\Content\PostFields;
use SocialIntegrations\Tests\FakeNetwork;
use SocialIntegrations\Tests\TestCase;

final class PostFieldsTest extends TestCase {

	public function test_clean_sanitizes_keys_and_values(): void {
		$map = PostFields::clean(
			array(
				'*'        => array( 'Title' => '<b>Hi</b>' ),
				'Fake Net' => array(
					'format' => 'link',
					'list'   => array( 'x' ),
					''       => 'dropped',
				),
				'other'    => 'not an array',
			)
		);

		$this->assertSame(
			array(
				'*'       => array( 'title' => 'Hi' ),
				'fakenet' => array( 'format' => 'link' ),
			),
			$map
		);
	}

	public function test_clean_cuts_long_values(): void {
		$map = PostFields::clean( array( 'fake' => array( 'title' => str_repeat( 'é', PostFields::MAX + 10 ) ) ) );

		$this->assertSame( PostFields::MAX, mb_strlen( $map['fake']['title'] ) );
	}

	public function test_fill_uses_network_then_shared_then_default(): void {
		$network = new FakeNetwork();
		$render  = static function ( string $text ): string {
			return str_replace( '{title}', 'Post', $text );
		};

		$this->assertSame(
			array(
				'format'        => 'auto',
				'title'         => 'Post',
				'first_comment' => '',
			),
			PostFields::fill( $network, array(), $render )
		);

		$this->assertSame(
			array(
				'format'        => 'text',
				'title'         => 'Own',
				'first_comment' => 'Post!',
			),
			PostFields::fill(
				$network,
				array(
					'*'    => array(
						'format'        => 'link',
						'title'         => 'Shared',
						'first_comment' => '{title}!',
					),
					'fake' => array(
						'format' => 'text',
						'title'  => 'Own',
					),
				),
				$render
			)
		);
	}

	public function test_fill_without_render_leaves_token_fields_empty(): void {
		$values = PostFields::fill( new FakeNetwork(), array() );

		$this->assertSame( '', $values['title'] );
		$this->assertSame( 'auto', $values['format'] );
	}

	public function test_merge_keeps_base_for_empty_values(): void {
		$this->assertSame(
			array(
				'*'    => array( 'title' => 'Base' ),
				'fake' => array(
					'title'  => 'Over',
					'format' => 'link',
				),
			),
			PostFields::merge(
				array(
					'*'    => array( 'title' => 'Base' ),
					'fake' => array( 'title' => 'Old' ),
				),
				array(
					'*'    => array( 'title' => '  ' ),
					'fake' => array(
						'title'  => 'Over',
						'format' => 'link',
					),
				)
			)
		);
	}

	/**
	 * @dataProvider values
	 */
	public function test_value_checks_the_field( array $field, string $in, string $out ): void {
		$this->assertSame( $out, PostFields::value( $field, $in ) );
	}

	public function values(): array {
		$select = array(
			'type'    => 'select',
			'default' => 'a',
			'options' => array( array( 'value' => 'a' ), array( 'value' => 'b' ) ),
		);
		return array(
			'select allowed'   => array( $select, 'b', 'b' ),
			'select unknown'   => array( $select, 'z', 'a' ),
			'toggle on'        => array( array( 'type' => 'toggle' ), 'yes', '1' ),
			'toggle off'       => array( array( 'type' => 'toggle' ), 'no', '' ),
			'text trimmed'     => array( array( 'type' => 'text' ), '  hi ', 'hi' ),
			'text at max'      => array( array( 'max' => 5 ), 'abcde', 'abcde' ),
			'text over max'    => array( array( 'max' => 5 ), 'abc defgh', 'abc…' ),
			'text with no max' => array( array( 'max' => 0 ), str_repeat( 'a', 50 ), str_repeat( 'a', 50 ) ),
		);
	}

	public function test_apply_format(): void {
		$network = new FakeNetwork();
		$payload = array(
			'link'   => 'https://example.com',
			'images' => array( array( 'url' => 'i.jpg' ) ),
			'videos' => array( array( 'url' => 'v.mp4' ) ),
		);

		$auto = PostFields::apply_format( $network, $payload + array( 'fields' => array( 'format' => 'auto' ) ) );
		$link = PostFields::apply_format( $network, $payload + array( 'fields' => array( 'format' => 'link' ) ) );
		$text = PostFields::apply_format( $network, $payload + array( 'fields' => array( 'format' => 'text' ) ) );

		$this->assertCount( 1, $auto['images'] );
		$this->assertSame( array(), $link['images'] );
		$this->assertSame( array(), $link['videos'] );
		$this->assertSame( 'https://example.com', $link['link'] );
		$this->assertSame( '', $text['link'] );
	}

	public function test_apply_format_does_nothing_without_a_format_field(): void {
		$payload = array(
			'link'   => 'https://example.com',
			'images' => array( array( 'url' => 'i.jpg' ) ),
			'fields' => array( 'format' => 'text' ),
		);

		$this->assertSame( $payload, PostFields::apply_format( new FakeNetwork( array() ), $payload ) );
	}
}
