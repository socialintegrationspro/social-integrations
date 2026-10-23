<?php
/**
 * A network for tests.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests;

use SocialIntegrations\Networks\AbstractNetwork;

/**
 * A network with a short character limit and the shared post fields.
 */
class FakeNetwork extends AbstractNetwork {

	/** @var array[] */
	public $fields;

	/** @var int */
	public $limit = 20;

	/** @var int */
	public $images = 2;

	public function __construct( ?array $fields = null ) {
		$this->fields = $fields ?? array(
			$this->format_field(),
			$this->title_field( 10 ),
			$this->first_comment_field(),
		);
	}

	public function key(): string {
		return 'fake';
	}

	public function label(): string {
		return 'Fake';
	}

	public function char_limit(): int {
		return $this->limit;
	}

	public function max_images(): int {
		return $this->images;
	}

	public function post_fields(): array {
		return $this->fields;
	}

	public function publish( array $credentials, array $payload ): array {
		return array(
			'remote_id'  => '1',
			'remote_url' => 'https://example.com/1',
		);
	}
}
