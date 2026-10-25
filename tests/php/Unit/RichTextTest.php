<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Unit;

use SocialIntegrations\Templates\RichText;
use SocialIntegrations\Tests\TestCase;

final class RichTextTest extends TestCase {

	public function test_parse_reads_marks_and_ends_them_at_the_line_end(): void {
		$runs = RichText::parse( "{b}Sale {i}now{/i}{/b} today\n{b}open" );

		$this->assertSame(
			array(
				array( 'text' => 'Sale ', 'marks' => array( 'b' ) ),
				array( 'text' => 'now', 'marks' => array( 'b', 'i' ) ),
				array( 'text' => ' today', 'marks' => array() ),
				array( 'text' => "\n", 'marks' => array() ),
				array( 'text' => 'open', 'marks' => array( 'b' ) ),
			),
			$runs
		);
	}

	public function test_a_mark_in_double_braces_is_text(): void {
		$this->assertSame( 'Use {b} for bold', RichText::plain( 'Use {{b}} for bold' ) );
		$this->assertFalse( RichText::has_marks( 'Use {{b}} for bold' ) );
		$this->assertTrue( RichText::has_marks( 'A {b}bold{/b} word' ) );
		$this->assertSame( 'Use {{b}} {b}x{/b}', RichText::join( RichText::parse( 'Use {{b}} {b}x{/b}' ) ) );
	}

	public function test_unicode_keeps_links_hashtags_and_mentions(): void {
		$out = RichText::to_unicode( '{b}Sale 2 #Shoes @shop https://a.example/x{/b} done' );

		$this->assertSame( "\u{1D5E6}\u{1D5EE}\u{1D5F9}\u{1D5F2} \u{1D7EE} #Shoes @shop https://a.example/x done", $out );
	}

	public function test_unicode_styles(): void {
		$this->assertSame( "\u{1D622}", RichText::to_unicode( '{i}a{/i}' ) );
		$this->assertSame( "\u{1D656}", RichText::to_unicode( '{b}{i}a{/i}{/b}' ) );
		$this->assertSame( "\u{1D68A}\u{1D7F7}", RichText::to_unicode( '{m}a1{/m}' ) );
		$this->assertSame( "a\u{0332} b\u{0332}", RichText::to_unicode( '{u}a b{/u}' ) );
		$this->assertSame( "é\u{0336}", RichText::to_unicode( '{s}é{/s}' ) );
	}

	public function test_markdown_puts_spaces_outside_the_markers(): void {
		$this->assertSame( '**Sale now** today', RichText::to_markdown( '{b}Sale now {/b}today' ) );
		$this->assertSame( '***Both***', RichText::to_markdown( '{b}{i}Both{/i}{/b}' ) );
		$this->assertSame( '__Under__ and `code`', RichText::to_markdown( '{u}Under{/u} and {m}{b}code{/b}{/m}' ) );
		$this->assertSame( 'Under', RichText::to_markdown( '{u}Under{/u}', false ) );
	}

	public function test_html_escapes_the_text(): void {
		$this->assertSame( '<b>Tom &amp; </b><b><i>Jerry</i></b> &lt;3', RichText::to_html( '{b}Tom & {i}Jerry{/i}{/b} <3' ) );
		$this->assertSame( '<code>x</code>', RichText::to_html( '{m}x{/m}' ) );
	}

	public function test_fit_cuts_by_the_text_a_person_reads_and_keeps_the_marks_in_pairs(): void {
		$this->assertSame( '{b}Hello{/b} wo…', RichText::fit( '{b}Hello{/b} world', 9 ) );
		$this->assertSame( '{b}Hel…{/b}', RichText::fit( '{b}Hello{/b} world', 4 ) );
		$this->assertSame( '{b}Hi{/b}', RichText::fit( '{b}Hi{/b}', 2 ) );
	}
}
