<?php
/**
 * Threads network.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

defined( 'ABSPATH' ) || exit;

/**
 * Posts to Threads through the Threads API (graph.threads.net).
 *
 * The user signs in with their own Meta app. The short-lived token is swapped for a
 * long-lived one (60 days) that refresh() renews. Publishing creates a media
 * container, then publishes it.
 */
class Threads extends AbstractNetwork {

	const API       = 'https://graph.threads.net/v1.0';
	const ROOT      = 'https://graph.threads.net';
	const AUTHORIZE = 'https://threads.net/oauth/authorize';

	/**
	 * Graph error codes that mean the token no longer works.
	 */
	const EXPIRED_CODES = array( 190, 102 );

	/**
	 * Unique key.
	 */
	public function key(): string {
		return 'threads';
	}

	/**
	 * Name shown in the UI.
	 */
	public function label(): string {
		return __( 'Threads', 'social-integrations' );
	}

	/**
	 * Maximum post length.
	 */
	public function char_limit(): int {
		return 500;
	}

	/**
	 * Brand color.
	 */
	public function color(): string {
		return '#000000';
	}

	/**
	 * Images in one post.
	 */
	public function max_images(): int {
		return 10;
	}

	/**
	 * Threads accepts video.
	 */
	public function supports_video(): bool {
		return true;
	}

	/**
	 * App fields, with Meta's names for the Threads app.
	 */
	public function app_fields(): array {
		return array(
			array(
				'name'  => 'client_id',
				'label' => __( 'Threads app ID', 'social-integrations' ),
				'type'  => 'text',
			),
			array(
				'name'  => 'client_secret',
				'label' => __( 'Threads app secret', 'social-integrations' ),
				'type'  => 'password',
			),
		);
	}

	/**
	 * Where the user creates a Meta app.
	 */
	public function app_setup_url(): string {
		return 'https://developers.facebook.com/apps/';
	}

	/**
	 * Sign-in URL.
	 *
	 * @param array  $app          App fields.
	 * @param string $redirect_uri Callback URL.
	 * @param string $state        Anti-forgery state.
	 */
	public function authorization_url( array $app, string $redirect_uri, string $state ): string {
		return self::build_url(
			self::AUTHORIZE,
			array(
				'client_id'     => (string) ( $app['client_id'] ?? '' ),
				'redirect_uri'  => $redirect_uri,
				'scope'         => 'threads_basic,threads_content_publish',
				'response_type' => 'code',
				'state'         => $state,
			)
		);
	}

	/**
	 * Swaps the code for a long-lived token.
	 *
	 * @param array  $app          App fields.
	 * @param string $code         Code from the callback.
	 * @param string $redirect_uri Callback URL.
	 * @throws NetworkException When Threads refuses the code.
	 */
	public function exchange_code( array $app, string $code, string $redirect_uri ): array {
		$short = $this->request(
			'POST',
			self::ROOT . '/oauth/access_token',
			array(
				'body' => array(
					'client_id'     => (string) ( $app['client_id'] ?? '' ),
					'client_secret' => (string) ( $app['client_secret'] ?? '' ),
					'grant_type'    => 'authorization_code',
					'redirect_uri'  => $redirect_uri,
					'code'          => $code,
				),
			)
		);
		if ( empty( $short['access_token'] ) ) {
			throw new NetworkException( 'oauth', esc_html__( 'Threads did not return an access token. Try connecting again.', 'social-integrations' ) );
		}

		$long = $this->http_get(
			self::ROOT . '/access_token',
			array(
				'grant_type'    => 'th_exchange_token',
				'client_secret' => (string) ( $app['client_secret'] ?? '' ),
				'access_token'  => (string) $short['access_token'],
			)
		);

		$credentials = array(
			'access_token' => ! empty( $long['access_token'] ) ? (string) $long['access_token'] : (string) $short['access_token'],
			'user_id'      => (string) ( $short['user_id'] ?? '' ),
		);
		return $this->with_expiry( $credentials, $long );
	}

	/**
	 * Renews the long-lived token. Works once the token is a day old and not yet expired.
	 *
	 * @param array $app         App fields.
	 * @param array $credentials Current credentials.
	 * @throws NetworkException When Threads refuses.
	 */
	public function refresh( array $app, array $credentials ): ?array {
		if ( empty( $credentials['access_token'] ) ) {
			return null;
		}
		$data = $this->http_get(
			self::ROOT . '/refresh_access_token',
			array(
				'grant_type'   => 'th_refresh_token',
				'access_token' => (string) $credentials['access_token'],
			)
		);
		if ( empty( $data['access_token'] ) ) {
			return null;
		}
		$fresh                 = $credentials;
		$fresh['access_token'] = (string) $data['access_token'];
		return $this->with_expiry( $fresh, $data );
	}

	/**
	 * Profile of the signed-in user.
	 *
	 * @param array $credentials Credentials.
	 */
	public function fetch_profile( array $credentials ): array {
		$data = $this->http_get(
			self::API . '/me',
			array(
				'fields'       => 'id,username,name,threads_profile_picture_url',
				'access_token' => (string) ( $credentials['access_token'] ?? '' ),
			)
		);
		if ( empty( $data['id'] ) ) {
			return array();
		}
		$username = (string) ( $data['username'] ?? '' );
		return array(
			'remote_id'   => (string) $data['id'],
			'name'        => '' !== (string) ( $data['name'] ?? '' ) ? (string) $data['name'] : $username,
			'username'    => $username,
			'avatar'      => (string) ( $data['threads_profile_picture_url'] ?? '' ),
			'profile_url' => '' !== $username ? 'https://www.threads.net/@' . rawurlencode( $username ) : '',
		);
	}

	/**
	 * Publishes a post.
	 *
	 * Two or more media items become a carousel, one becomes an image or video post,
	 * and text alone becomes a text post (with the link as an attachment). Media are
	 * passed by public URL, so Threads must be able to download them.
	 *
	 * @param array $credentials ['access_token', 'user_id'].
	 * @param array $payload     Share payload.
	 * @throws NetworkException When Threads refuses the share.
	 */
	public function publish( array $credentials, array $payload ): array {
		$token = (string) ( $credentials['access_token'] ?? '' );
		if ( '' === $token ) {
			throw new NetworkException( 'expired', esc_html__( 'The Threads account is not connected. Reconnect the account.', 'social-integrations' ) );
		}
		$user = '' !== (string) ( $credentials['user_id'] ?? '' ) ? (string) $credentials['user_id'] : 'me';

		$text = $this->fit_text( (string) ( $payload['message'] ?? '' ) );
		$link = (string) ( $payload['link'] ?? '' );

		$container = $this->create_post_container( $user, $token, $this->collect_media( $payload ), $text, $link );

		$published = $this->request(
			'POST',
			self::API . '/' . rawurlencode( $user ) . '/threads_publish',
			array(
				'body' => array(
					'creation_id'  => $container,
					'access_token' => $token,
				),
			)
		);
		$post_id   = (string) ( $published['id'] ?? '' );
		if ( '' === $post_id ) {
			throw new NetworkException( 'unknown', esc_html__( 'Threads did not confirm the post. Check the profile before trying again.', 'social-integrations' ) );
		}

		return array(
			'remote_id'  => $post_id,
			'remote_url' => $this->permalink( $post_id, $token ),
		);
	}

	/**
	 * Videos first, then images up to max_images(); 20 items at most.
	 *
	 * @param array $payload Share payload.
	 * @return array[] Each: ['type' => 'VIDEO'|'IMAGE', 'url', 'alt'?].
	 */
	private function collect_media( array $payload ): array {
		$media = array();
		foreach ( (array) ( $payload['videos'] ?? array() ) as $video ) {
			if ( is_array( $video ) && ! empty( $video['url'] ) ) {
				$media[] = array(
					'type' => 'VIDEO',
					'url'  => (string) $video['url'],
				);
			}
		}
		$images = 0;
		foreach ( (array) ( $payload['images'] ?? array() ) as $image ) {
			if ( is_array( $image ) && ! empty( $image['url'] ) && $images < $this->max_images() ) {
				$item = array(
					'type' => 'IMAGE',
					'url'  => (string) $image['url'],
				);
				if ( ! empty( $image['alt'] ) ) {
					$item['alt'] = (string) $image['alt'];
				}
				$media[] = $item;
				++$images;
			}
		}
		$media = array_slice( $media, 0, 20 );
		return $media;
	}

	/**
	 * Creates the container to publish: a carousel, one media item, or text with the link.
	 *
	 * @param string  $user  Threads user ID, or 'me'.
	 * @param string  $token Access token.
	 * @param array[] $media From collect_media().
	 * @param string  $text  Caption.
	 * @param string  $link  Post link.
	 * @return string Container ID.
	 * @throws NetworkException When Threads refuses a container.
	 */
	private function create_post_container( string $user, string $token, array $media, string $text, string $link ): string {
		if ( count( $media ) > 1 ) {
			$children = array();
			foreach ( $media as $item ) {
				$params = $this->media_params( $item );

				$params['is_carousel_item'] = 'true';

				$child = $this->create_container( $user, $token, $params );
				$this->wait_for_container( $child, $token, 'VIDEO' === $item['type'] ? 120 : 30 );
				$children[] = $child;
			}
			$container = $this->create_container(
				$user,
				$token,
				array(
					'media_type' => 'CAROUSEL',
					'children'   => implode( ',', $children ),
					'text'       => $text,
				)
			);
			$this->wait_for_container( $container, $token, 30 );
		} elseif ( 1 === count( $media ) ) {
			$params         = $this->media_params( $media[0] );
			$params['text'] = $text;
			$container      = $this->create_container( $user, $token, $params );
			$this->wait_for_container( $container, $token, 'VIDEO' === $media[0]['type'] ? 120 : 30 );
		} else {
			$params = array(
				'media_type' => 'TEXT',
				'text'       => $text,
			);
			if ( '' !== $link ) {
				$params['link_attachment'] = $link;
			}
			$container = $this->create_container( $user, $token, $params );
		}
		return $container;
	}

	/**
	 * Permalink of a published post. Empty when Threads does not give it.
	 *
	 * @param string $post_id Post ID.
	 * @param string $token   Access token.
	 */
	private function permalink( string $post_id, string $token ): string {
		try {
			$node = $this->http_get(
				self::API . '/' . rawurlencode( $post_id ),
				array(
					'fields'       => 'permalink',
					'access_token' => $token,
				)
			);
			return (string) ( $node['permalink'] ?? '' );
		} catch ( NetworkException $e ) {
			return '';
		}
	}

	/**
	 * Container fields for one media item.
	 *
	 * @param array $item ['type', 'url', 'alt'].
	 */
	private function media_params( array $item ): array {
		$params = array( 'media_type' => $item['type'] );
		if ( 'VIDEO' === $item['type'] ) {
			$params['video_url'] = $item['url'];
		} else {
			$params['image_url'] = $item['url'];
		}
		if ( ! empty( $item['alt'] ) ) {
			$params['alt_text'] = $item['alt'];
		}
		return $params;
	}

	/**
	 * Creates a media container and returns its ID.
	 *
	 * @param string $user   User ID.
	 * @param string $token  Access token.
	 * @param array  $params Container fields.
	 * @throws NetworkException When Threads refuses.
	 */
	private function create_container( string $user, string $token, array $params ): string {
		$node = $this->request(
			'POST',
			self::API . '/' . rawurlencode( $user ) . '/threads',
			array( 'body' => $params + array( 'access_token' => $token ) )
		);
		$id   = (string) ( $node['id'] ?? '' );
		if ( '' === $id ) {
			throw new NetworkException( 'unknown', esc_html__( 'Threads did not accept the post content.', 'social-integrations' ) );
		}
		return $id;
	}

	/**
	 * Waits until Threads has processed a container.
	 *
	 * @param string $id          Container ID.
	 * @param string $token       Access token.
	 * @param int    $max_seconds Longest wait.
	 * @throws NetworkException When processing fails or takes too long.
	 */
	private function wait_for_container( string $id, string $token, int $max_seconds ): void {
		$deadline = time() + $max_seconds;
		do {
			$node   = $this->http_get(
				self::API . '/' . rawurlencode( $id ),
				array(
					'fields'       => 'status,error_message',
					'access_token' => $token,
				)
			);
			$status = (string) ( $node['status'] ?? '' );
			if ( 'FINISHED' === $status || 'PUBLISHED' === $status || '' === $status ) {
				return;
			}
			if ( 'ERROR' === $status || 'EXPIRED' === $status ) {
				/* translators: %s: reason from Threads */
				throw new NetworkException( 'media', esc_html( trim( sprintf( __( 'Threads could not process the media. %s', 'social-integrations' ), (string) ( $node['error_message'] ?? '' ) ) ) ) );
			}
			sleep( 3 );
		} while ( time() < $deadline );

		throw new NetworkException( 'timeout', esc_html__( 'Threads is taking too long to process the media. Try again in a few minutes.', 'social-integrations' ) );
	}

	/**
	 * Marks Graph token errors as expired.
	 *
	 * @param int   $status HTTP status.
	 * @param array $body   Decoded body.
	 */
	protected function error_code( int $status, array $body ): string {
		if ( in_array( (int) ( $body['error']['code'] ?? 0 ), self::EXPIRED_CODES, true ) ) {
			return 'expired';
		}
		return parent::error_code( $status, $body );
	}
}
