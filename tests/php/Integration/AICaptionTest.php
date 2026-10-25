<?php
/**
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Tests\Integration;

// phpcs:ignoreFile

use SocialIntegrations\AI\ProviderInterface;
use SocialIntegrations\Hooks;
use SocialIntegrations\AI\AutoCaption;
use SocialIntegrations\Scheduler\AutoShare;
use SocialIntegrations\Scheduler\Queue;

/** An AI provider that gives a fixed answer, and keeps the last prompt. */
final class FakeAI implements ProviderInterface {
	public static $answer = 'A caption';
	public static $prompt = '';
	public function key(): string { return 'fake'; }
	public function label(): string { return 'Fake AI'; }
	public function needs_key(): bool { return false; }
	public function default_model(): string { return 'fake-1'; }
	public static $calls = 0;
	public static $fail = false;
	public function write( string $system, string $prompt, string $key, string $model ): string {
		self::$prompt = $prompt;
		++self::$calls;
		if ( self::$fail ) {
			throw new \SocialIntegrations\AI\AIException( 'Fake AI is busy.' );
		}
		return self::$answer;
	}
}

final class AICaptionTest extends IntegrationTestCase {

	public function set_up(): void {
		parent::set_up();
		$this->login();
		add_filter( Hooks::AI_PROVIDERS, static function ( $list ) { $list[] = new FakeAI(); return $list; } );
		$this->rest( 'POST', '/settings', array( 'ai' => array( 'provider' => 'fake', 'tone' => 'friendly', 'model' => '' ) ) );
		FakeAI::$calls = 0;
		FakeAI::$fail  = false;
	}

	/** Publishes a post that an auto-post campaign with AI instructions shares, and runs the cron event. */
	private function auto_post( array $ai ): array {
		$account = $this->facebook();
		$this->rest(
			'POST',
			'/campaigns/auto',
			array(
				'name'       => 'AI posts',
				'post_types' => array( 'post' ),
				'accounts'   => array( $account ),
				'caption'    => '{title}',
				'ai'         => $ai,
			)
		);
		$post_id = self::factory()->post->create( array( 'post_title' => 'Big sale', 'post_status' => 'draft' ) );
		wp_publish_post( $post_id );
		do_action( AutoShare::CRON_HOOK, $post_id );
		return array( $post_id, Queue::for_post( $post_id ) );
	}

	public function test_auto_post_uses_the_caption_that_the_ai_writes_from_the_instructions(): void {
		FakeAI::$answer = 'Huge savings today';

		list( $post_id, $shares ) = $this->auto_post( array( 'on' => true, 'prompt' => 'Say that {title} ends soon.', 'tone' => 'bold' ) );

		$this->assertSame( "Huge savings today\n\n" . get_permalink( $post_id ), $shares[0]['caption'] );
		$this->assertSame( 1, FakeAI::$calls );
		$this->assertStringContainsString( 'Say that Big sale ends soon.', FakeAI::$prompt );
		$this->assertStringContainsString( 'Tone: bold.', FakeAI::$prompt );
	}

	public function test_auto_post_uses_the_template_caption_when_the_ai_fails(): void {
		FakeAI::$fail = true;

		list( $post_id, $shares ) = $this->auto_post( array( 'on' => true, 'prompt' => 'Write about {title}.' ) );

		$this->assertSame( 'Big sale', $shares[0]['caption'] );
		$errors = get_post_meta( $post_id, AutoCaption::META_ERROR, true );
		$this->assertContains( 'Fake AI is busy.', array_values( (array) $errors ) );

		// The share log says why the share has the template caption.
		$result = \SocialIntegrations\Scheduler\Publisher::send_now( (int) $shares[0]['id'] );
		$this->assertSame( 'published', $result['status'] );
		$this->assertSame( 'The AI did not write the caption, so the plugin used the template caption. Fake AI is busy.', $result['message'] );
		$this->assertSame( array( 'error' => 'Fake AI is busy.' ), $result['details']['ai'] );
	}

	public function test_auto_post_without_ai_does_not_call_it(): void {
		list( , $shares ) = $this->auto_post( array( 'on' => false, 'prompt' => 'Write about {title}.' ) );

		$this->assertSame( 'Big sale', $shares[0]['caption'] );
		$this->assertSame( 0, FakeAI::$calls );
	}

	public function test_prompt_mode_tests_the_instructions_with_a_post(): void {
		FakeAI::$answer = 'Tested caption';
		$post = self::factory()->post->create( array( 'post_title' => 'Shoes', 'post_status' => 'publish' ) );

		$data = $this->rest( 'POST', '/ai/caption', array( 'mode' => 'prompt', 'post_id' => $post, 'prompt' => 'Mention {title|upper}.' ) )->get_data();

		$this->assertSame( "Tested caption\n\n" . get_permalink( $post ), $data['caption'] );
		$this->assertStringContainsString( 'Mention SHOES.', FakeAI::$prompt );
	}

	public function test_shorter_mode_sends_the_task_and_the_caption(): void {
		FakeAI::$answer = '"Short one"';

		$data = $this->rest( 'POST', '/ai/caption', array( 'text' => 'A long caption about shoes', 'mode' => 'shorter' ) )->get_data();

		$this->assertSame( 'Short one', $data['caption'] );
		$this->assertSame( array(), $data['warnings'] );
		$this->assertStringContainsString( 'Make this caption shorter.', FakeAI::$prompt );
		$this->assertStringContainsString( 'A long caption about shoes', FakeAI::$prompt );
	}

	public function test_template_mode_keeps_tokens_and_warns_about_a_removed_one(): void {
		FakeAI::$answer = '{b}New: {title|upper}{/i} now';

		$data = $this->rest(
			'POST',
			'/ai/caption',
			array(
				'text'     => '{title|upper} for {price}',
				'mode'     => 'improve',
				'template' => true,
				'tokens'   => array( '{title}', '{price}' ),
			)
		)->get_data();

		// The mark without its pair closes at the end of the line.
		$this->assertSame( '{b}New: {title|upper} now{/b}', $data['caption'] );
		$this->assertSame( array( 'The AI removed {price}. Add it again if the caption needs it.' ), $data['warnings'] );
		$this->assertStringContainsString( 'Keep each placeholder exactly as written', FakeAI::$prompt );
		$this->assertStringContainsString( 'You may use these placeholders: {title} {price}', FakeAI::$prompt );
	}

	public function test_template_write_needs_no_post(): void {
		FakeAI::$answer = '{title} is here: {url}';

		$data = $this->rest( 'POST', '/ai/caption', array( 'mode' => 'write', 'template' => true, 'tokens' => array( '{title}', '{url}' ) ) )->get_data();

		$this->assertSame( '{title} is here: {url}', $data['caption'] );
		$this->assertStringContainsString( 'Write a caption template for the posts of this website.', FakeAI::$prompt );
	}

	public function test_a_mode_that_changes_text_needs_text(): void {
		$response = $this->rest( 'POST', '/ai/caption', array( 'mode' => 'emojis' ) );

		$this->assertSame( 'Write a caption first. Then the AI can change it.', $response->get_data()['message'] );
	}

	public function test_write_from_a_post_adds_the_link(): void {
		FakeAI::$answer = 'Great shoes';
		$post = self::factory()->post->create( array( 'post_title' => 'Shoes', 'post_status' => 'publish' ) );

		$data = $this->rest( 'POST', '/ai/caption', array( 'post_id' => $post ) )->get_data();

		$this->assertSame( "Great shoes\n\n" . get_permalink( $post ), $data['caption'] );
		$this->assertStringContainsString( 'Title: Shoes', FakeAI::$prompt );
	}
}
