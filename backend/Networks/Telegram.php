<?php
/**
 * Telegram network.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

defined( 'ABSPATH' ) || exit;

/**
 * Posts to a Telegram channel or group through a bot.
 *
 * The user creates a bot with @BotFather, adds it to the channel as an admin and
 * enters the bot token and the chat. The bot token does not expire.
 */
class Telegram extends AbstractNetwork {

	const API = 'https://api.telegram.org';

	/**
	 * Longest caption on a photo or video.
	 */
	const CAPTION_LIMIT = 1024;

	/**
	 * Unique key.
	 */
	public function key(): string {
		return 'telegram';
	}

	/**
	 * Name shown in the UI.
	 */
	public function label(): string {
		return __( 'Telegram', 'social-integrations' );
	}

	/**
	 * Maximum message length. With media, the first 1024 characters are the caption.
	 */
	public function char_limit(): int {
		return 4096;
	}

	/**
	 * Brand color.
	 */
	public function color(): string {
		return '#229ED9';
	}

	/**
	 * Connects with a bot token.
	 */
	public function auth_type(): string {
		return 'token';
	}

	/**
	 * Images in one post.
	 */
	public function max_images(): int {
		return 10;
	}

	/**
	 * Telegram accepts video.
	 */
	public function supports_video(): bool {
		return true;
	}

	/**
	 * Fields the user fills in.
	 */
	public function connect_fields(): array {
		return array(
			array(
				'name'  => 'bot_token',
				'label' => __( 'Bot token', 'social-integrations' ),
				'type'  => 'password',
				'help'  => __( 'Create a bot with @BotFather in Telegram and paste the token it gives you.', 'social-integrations' ),
			),
			array(
				'name'  => 'chat_id',
				'label' => __( 'Channel or group', 'social-integrations' ),
				'type'  => 'text',
				'help'  => __( 'The channel @username, or the numeric chat ID of a private channel or group. Add the bot as an admin first.', 'social-integrations' ),
			),
		);
	}

	/**
	 * Where the user creates a bot.
	 */
	public function app_setup_url(): string {
		return 'https://t.me/BotFather';
	}

	/**
	 * Checks the bot token and the chat.
	 *
	 * @param array $input ['bot_token', 'chat_id'].
	 * @throws NetworkException When the token or the chat does not work.
	 */
	public function authenticate( array $input ): array {
		$token = trim( (string) ( $input['bot_token'] ?? '' ) );
		$chat  = $this->normalize_chat( (string) ( $input['chat_id'] ?? '' ) );
		if ( '' === $token || '' === $chat ) {
			throw new NetworkException( 'invalid', esc_html__( 'Enter the bot token and the channel or group.', 'social-integrations' ) );
		}
		if ( ! preg_match( '/^\d+:[A-Za-z0-9_-]+$/', $token ) ) {
			throw new NetworkException( 'invalid', esc_html__( 'This does not look like a bot token. Copy it again from @BotFather.', 'social-integrations' ) );
		}

		try {
			$me = $this->call( $token, 'getMe' );
		} catch ( NetworkException $e ) {
			if ( $e->is_expired() || 404 === $e->getCode() ) {
				throw new NetworkException( 'invalid', esc_html__( 'Telegram did not accept this bot token. Copy it again from @BotFather.', 'social-integrations' ) );
			}
			throw $e;
		}

		try {
			$info = $this->call( $token, 'getChat', array( 'chat_id' => $chat ) );
		} catch ( NetworkException $e ) {
			if ( $e->is_expired() ) {
				throw $e;
			}
			throw new NetworkException( 'invalid', esc_html__( 'The bot cannot find this channel or group. Add the bot to it as an admin and check the @username or chat ID.', 'social-integrations' ) );
		}

		if ( 'channel' === ( $info['type'] ?? '' ) && ! empty( $me['id'] ) ) {
			try {
				$member = $this->call(
					$token,
					'getChatMember',
					array(
						'chat_id' => $chat,
						'user_id' => (string) $me['id'],
					)
				);
			} catch ( NetworkException $e ) {
				$member = array();
			}
			$status = (string) ( $member['status'] ?? '' );
			if ( 'creator' !== $status && ( 'administrator' !== $status || empty( $member['can_post_messages'] ) ) ) {
				throw new NetworkException( 'invalid', esc_html__( 'The bot is not allowed to post in this channel. Make it an admin with permission to post messages.', 'social-integrations' ) );
			}
		}

		$chat_id  = isset( $info['id'] ) ? (string) $info['id'] : $chat;
		$username = (string) ( $info['username'] ?? '' );
		$name     = (string) ( $info['title'] ?? '' );
		if ( '' === $name ) {
			$name = trim( (string) ( $info['first_name'] ?? '' ) . ' ' . (string) ( $info['last_name'] ?? '' ) );
		}

		return array(
			'credentials' => array(
				'bot_token' => $token,
				'chat_id'   => $chat_id,
				'username'  => $username,
			),
			'profile'     => array(
				'remote_id'   => $chat_id,
				'name'        => '' !== $name ? $name : $username,
				'username'    => $username,
				'avatar'      => '',
				'profile_url' => '' !== $username ? 'https://t.me/' . $username : '',
			),
		);
	}

	/**
	 * Sends the share to the chat.
	 *
	 * Several images go as an album (sendMediaGroup), one video with sendVideo, one
	 * image with sendPhoto, and text with sendMessage. Telegram allows 1024 characters
	 * under media; a longer text is sent as its own message after the media.
	 *
	 * @param array $credentials ['bot_token', 'chat_id', 'username'].
	 * @param array $payload     Share payload.
	 * @throws NetworkException When Telegram refuses the share.
	 */
	public function publish( array $credentials, array $payload ): array {
		$token = (string) ( $credentials['bot_token'] ?? '' );
		$chat  = (string) ( $credentials['chat_id'] ?? '' );
		if ( '' === $token || '' === $chat ) {
			throw new NetworkException( 'expired', esc_html__( 'The Telegram bot is not connected. Reconnect the account.', 'social-integrations' ) );
		}

		$text = $this->fit_text( (string) ( $payload['message'] ?? '' ) );
		$link = (string) ( $payload['link'] ?? '' );

		$images = $this->image_urls( $payload );

		$video = '';
		foreach ( (array) ( $payload['videos'] ?? array() ) as $item ) {
			if ( is_array( $item ) && ! empty( $item['url'] ) ) {
				$video = (string) $item['url'];
				break;
			}
		}

		$has_media = ! empty( $images ) || '' !== $video;
		$separate  = $has_media && mb_strlen( $text ) > self::CAPTION_LIMIT;
		$caption   = $separate ? '' : $text;

		$message = $has_media
			? $this->send_media( $token, $chat, $images, $video, $caption )
			: $this->send_text( $token, $chat, $text, $link );

		if ( $separate ) {
			$message = $this->send_text( $token, $chat, $text, $link );
		}

		$message_id = (string) ( $message['message_id'] ?? '' );
		if ( '' === $message_id ) {
			throw new NetworkException( 'unknown', esc_html__( 'Telegram did not confirm the message. Check the chat before trying again.', 'social-integrations' ) );
		}

		return array(
			'remote_id'  => $message_id,
			'remote_url' => $this->message_url( $message, $credentials, $message_id ),
		);
	}

	/**
	 * Sends the images or the video, with the caption on the first item.
	 *
	 * @param string   $token   Bot token.
	 * @param string   $chat    Chat ID.
	 * @param string[] $images  Image URLs.
	 * @param string   $video   Video URL, or ''. More than one image goes before the video.
	 * @param string   $caption Caption, or '' when the text goes in its own message.
	 * @return array The sent message.
	 * @throws NetworkException When Telegram refuses the media.
	 */
	private function send_media( string $token, string $chat, array $images, string $video, string $caption ): array {
		if ( count( $images ) > 1 ) {
			$media = array();
			foreach ( $images as $index => $url ) {
				$item = array(
					'type'  => 'photo',
					'media' => $url,
				);
				if ( 0 === $index && '' !== $caption ) {
					$item['caption'] = $caption;
				}
				$media[] = $item;
			}
			$result = $this->call(
				$token,
				'sendMediaGroup',
				array(
					'chat_id' => $chat,
					'media'   => (string) wp_json_encode( $media ),
				)
			);
			return isset( $result[0] ) && is_array( $result[0] ) ? $result[0] : array();
		}
		if ( '' !== $video ) {
			return $this->call(
				$token,
				'sendVideo',
				array(
					'chat_id'            => $chat,
					'video'              => $video,
					'caption'            => $caption,
					'supports_streaming' => 'true',
				)
			);
		}
		return $this->call(
			$token,
			'sendPhoto',
			array(
				'chat_id' => $chat,
				'photo'   => $images[0],
				'caption' => $caption,
			)
		);
	}

	/**
	 * Sends a text message, previewing the link when there is one.
	 *
	 * @param string $token Bot token.
	 * @param string $chat  Chat ID.
	 * @param string $text  Text.
	 * @param string $link  Link to preview, or ''.
	 */
	private function send_text( string $token, string $chat, string $text, string $link ): array {
		if ( '' === trim( $text ) ) {
			$text = $link;
		}
		$fields = array(
			'chat_id' => $chat,
			'text'    => $text,
		);
		if ( '' !== $link ) {
			$fields['link_preview_options'] = (string) wp_json_encode( array( 'url' => $link ) );
		}
		return $this->call( $token, 'sendMessage', $fields );
	}

	/**
	 * Public link to a message: t.me/{username}/{id}, or t.me/c/{id}/{id} for private chats.
	 *
	 * @param array  $message     Message object.
	 * @param array  $credentials Credentials.
	 * @param string $message_id  Message ID.
	 */
	private function message_url( array $message, array $credentials, string $message_id ): string {
		$username = (string) ( $message['chat']['username'] ?? ( $credentials['username'] ?? '' ) );
		if ( '' !== $username ) {
			return 'https://t.me/' . rawurlencode( $username ) . '/' . $message_id;
		}
		$chat_id = (string) ( $message['chat']['id'] ?? ( $credentials['chat_id'] ?? '' ) );
		if ( 0 === strpos( $chat_id, '-100' ) ) {
			return 'https://t.me/c/' . substr( $chat_id, 4 ) . '/' . $message_id;
		}
		return '';
	}

	/**
	 * Accepts @name, name, t.me/name links and numeric IDs.
	 *
	 * @param string $chat Raw input.
	 */
	private function normalize_chat( string $chat ): string {
		$chat = trim( sanitize_text_field( $chat ) );
		if ( preg_match( '~^(?:https?://)?(?:www\.)?(?:t|telegram)\.me/([A-Za-z0-9_]+)~i', $chat, $m ) ) {
			return '@' . $m[1];
		}
		if ( preg_match( '/^-?\d+$/', $chat ) ) {
			return $chat;
		}
		$chat = ltrim( $chat, '@' );
		return preg_match( '/^[A-Za-z0-9_]+$/', $chat ) ? '@' . $chat : '';
	}

	/**
	 * Calls a Bot API method and returns its result.
	 *
	 * @param string $token  Bot token.
	 * @param string $method Method name.
	 * @param array  $fields Form fields.
	 * @return array The `result` value.
	 * @throws NetworkException When Telegram refuses.
	 */
	private function call( string $token, string $method, array $fields = array() ): array {
		$data = $this->request(
			'POST',
			self::API . '/bot' . $token . '/' . $method,
			array( 'body' => $fields )
		);
		if ( empty( $data['ok'] ) ) {
			throw new NetworkException( 'unknown', esc_html( $this->error_message( 400, $data ) ) );
		}
		return is_array( $data['result'] ?? null ) ? $data['result'] : array();
	}
}
