<?php
/**
 * Base class for the unit tests.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Mockery\Adapter\Phpunit\MockeryPHPUnitIntegration;

/**
 * Sets up Brain Monkey for each test, with the translation and escape functions
 * returning their text.
 */
abstract class TestCase extends \PHPUnit\Framework\TestCase {

	use MockeryPHPUnitIntegration;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		Functions\stubTranslationFunctions();
		Functions\stubEscapeFunctions();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * Calls a private or protected method.
	 *
	 * @param object $target Object.
	 * @param string $method Method name.
	 * @param mixed  ...$args Arguments.
	 * @return mixed
	 */
	protected function call( $target, string $method, ...$args ) {
		$ref = new \ReflectionMethod( $target, $method );
		$ref->setAccessible( true );
		return $ref->invoke( is_object( $target ) ? $target : null, ...$args );
	}
}
