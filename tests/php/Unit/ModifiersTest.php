<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use SocialIntegrations\Templates\Modifiers;
use SocialIntegrations\Tests\TestCase;

final class ModifiersTest extends TestCase {

	public function test_letter_case(): void {
		$this->assertSame( 'TRAIL RUNNER', Modifiers::apply( 'Trail runner', '|upper' ) );
		$this->assertSame( 'trail runner', Modifiers::apply( 'Trail Runner', '|lower' ) );
		$this->assertSame( 'Trail Runner', Modifiers::apply( 'trail runner', '|title' ) );
		$this->assertSame( 'ÉLAN', Modifiers::apply( 'élan', '|upper' ) );
	}

	public function test_words_and_characters(): void {
		$this->assertSame( 'Light trail shoes…', Modifiers::apply( 'Light trail shoes, with a grippy sole', '|words:3' ) );
		$this->assertSame( 'Short text', Modifiers::apply( 'Short text', '|words:5' ) );
		$this->assertSame( 'Light trail…', Modifiers::apply( 'Light trail shoes', '|chars:14' ) );
		$this->assertSame( 'Light trail shoes', Modifiers::apply( 'Light trail shoes', '|chars:17' ) );
	}

	public function test_default_for_an_empty_value(): void {
		$this->assertSame( 'Ask us', Modifiers::apply( '', '|default:Ask us' ) );
		$this->assertSame( '$89.00', Modifiers::apply( '$89.00', '|default:Ask us' ) );
	}

	public function test_modifiers_apply_from_left_to_right_and_unknown_ones_do_nothing(): void {
		$this->assertSame( 'LIGHT TRAIL…', Modifiers::apply( 'Light trail shoes', '|words:2|upper' ) );
		$this->assertSame( 'TBA', Modifiers::apply( '', '|upper|default:TBA' ) );
		$this->assertSame( 'Light', Modifiers::apply( 'Light', '|shout|nope:3' ) );
	}
}
