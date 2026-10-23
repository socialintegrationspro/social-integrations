<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use Brain\Monkey\Functions;
use SocialIntegrations\Support\Settings;
use SocialIntegrations\Tests\TestCase;

final class SettingsTest extends TestCase {

	public function test_all_gives_the_defaults_when_nothing_is_saved(): void {
		Functions\when( 'get_option' )->justReturn( false );

		$this->assertSame( Settings::defaults(), Settings::all() );
		$this->assertSame( 'fallback', Settings::get( 'missing', 'fallback' ) );
	}

	public function test_saved_lists_replace_default_lists(): void {
		Functions\when( 'get_option' )->justReturn(
			array(
				'blocks'     => array( 'core/paragraph' => 'text' ),
				'max_images' => 2,
				'ai'         => array( 'provider' => 'openai' ),
			)
		);

		$all = Settings::all();

		$this->assertSame( array( 'core/paragraph' => 'text' ), $all['blocks'] );
		$this->assertSame( 2, $all['max_images'] );
		$this->assertSame(
			array(
				'provider' => 'openai',
				'tone'     => 'friendly',
				'model'    => '',
			),
			$all['ai'],
			'AI settings merge over the defaults.'
		);
	}

	public function test_save_sanitizes_the_input(): void {
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\expect( 'update_option' )->once()->with( Settings::OPTION, \Mockery::type( 'array' ), false );

		$saved = Settings::save(
			array(
				'blocks'               => array(
					'Core/Image'    => 'media',
					'core/bad name' => 'text',
					'core/list'     => 'unknown use',
				),
				'block_fallback'       => 'nope',
				'allow_block_override' => 0,
				'max_images'           => 99,
				'log_days'             => 45,
				'ai'                   => array(
					'provider' => 'Open AI',
					'model'    => '<b>gpt</b>',
				),
			)
		);

		$this->assertSame(
			array(
				'core/image'   => 'media',
				'core/badname' => 'text',
			),
			$saved['blocks']
		);
		$this->assertSame( 'text', $saved['block_fallback'] );
		$this->assertFalse( $saved['allow_block_override'] );
		$this->assertSame( 10, $saved['max_images'] );
		$this->assertSame( 0, $saved['log_days'] );
		$this->assertSame(
			array(
				'provider' => 'openai',
				'tone'     => 'friendly',
				'model'    => 'gpt',
			),
			$saved['ai']
		);
	}

	public function test_save_keeps_allowed_values(): void {
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'update_option' )->justReturn( true );

		$saved = Settings::save(
			array(
				'max_images' => 0,
				'log_days'   => '90',
			)
		);

		$this->assertSame( 1, $saved['max_images'] );
		$this->assertSame( 90, $saved['log_days'] );
	}

	public function test_captions_drop_empty_templates(): void {
		$this->assertSame(
			array( 'bluesky' => '{title}' ),
			Settings::captions(
				array(
					'Bluesky'  => '{title}',
					'threads'  => '   ',
					'telegram' => array( 'x' ),
				)
			)
		);
	}
}
