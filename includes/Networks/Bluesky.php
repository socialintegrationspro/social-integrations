<?php
/**
 * Bluesky network.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

defined( 'ABSPATH' ) || exit;

/**
 * Posts to Bluesky through the AT Protocol.
 *
 * The user enters their handle and an app password. A session (access and refresh
 * JWTs) is created from them and renewed when it runs out.
 */
class Bluesky extends AbstractNetwork {

	const PDS      = 'https://bsky.social/xrpc';
	const APP_VIEW = 'https://public.api.bsky.app/xrpc';

	/**
	 * Largest image blob Bluesky accepts, in bytes.
	 */
	const MAX_BLOB = 976560;

	/**
	 * Error names that mean the session no longer works.
	 */
	const EXPIRED_ERRORS = array( 'ExpiredToken', 'InvalidToken', 'AuthenticationRequired', 'AccountTakedown' );

	/**
	 * Unique key.
	 */
	public function key(): string {
		return 'bluesky';
	}

	/**
	 * Name shown in the UI.
	 */
	public function label(): string {
		return __( 'Bluesky', 'social-integrations' );
	}

	/**
	 * Maximum post length. Bluesky counts graphemes; characters are close enough.
	 */
	public function char_limit(): int {
		return 300;
	}

	/**
	 * Brand color.
	 */
	public function color(): string {
		return '#1185FE';
	}

	/**
	 * Connects with a handle and an app password.
	 */
	public function auth_type(): string {
		return 'credentials';
	}

	/**
	 * Images in one post.
	 */
	public function max_images(): int {
		return 4;
	}

	/**
	 * Fields the user fills in.
	 */
	public function connect_fields(): array {
		return array(
			array(
				'name'  => 'handle',
				'label' => __( 'Handle', 'social-integrations' ),
				'type'  => 'text',
				'help'  => __( 'Your Bluesky handle, for example yourname.bsky.social.', 'social-integrations' ),
			),
			array(
				'name'  => 'app_password',
				'label' => __( 'App password', 'social-integrations' ),
				'type'  => 'password',
				'help'  => __( 'Create one in Bluesky under Settings → Privacy and security → App passwords.', 'social-integrations' ),
			),
		);
	}

	/**
	 * Where the user creates an app password.
	 */
	public function app_setup_url(): string {
		return 'https://bsky.app/settings/app-passwords';
	}

	/**
	 * Creates a session from the handle and app password.
	 *
	 * @param array $input ['handle', 'app_password'].
	 * @throws NetworkException When Bluesky refuses them.
	 */
	public function authenticate( array $input ): array {
		$handle   = ltrim( trim( sanitize_text_field( (string) ( $input['handle'] ?? '' ) ) ), '@' );
		$password = trim( (string) ( $input['app_password'] ?? '' ) );
		if ( '' === $handle || '' === $password ) {
			throw new NetworkException( 'invalid', esc_html__( 'Enter your Bluesky handle and an app password.', 'social-integrations' ) );
		}

		try {
			$credentials = $this->create_session( $handle, $password );
		} catch ( NetworkException $e ) {
			if ( $e->is_expired() ) {
				throw new NetworkException( 'invalid', esc_html__( 'Bluesky did not accept this handle and app password. Check both and try again.', 'social-integrations' ) );
			}
			throw $e;
		}

		$profile = $this->fetch_profile( $credentials );
		if ( empty( $profile['remote_id'] ) ) {
			$profile = array(
				'remote_id'   => $credentials['did'],
				'name'        => $credentials['handle'],
				'username'    => $credentials['handle'],
				'avatar'      => '',
				'profile_url' => 'https://bsky.app/profile/' . $credentials['handle'],
			);
		}

		return array(
			'credentials' => $credentials,
			'profile'     => $profile,
		);
	}

	/**
	 * Renews the session. Not tied to an app; $app is unused.
	 *
	 * @param array $app         Unused.
	 * @param array $credentials Current credentials.
	 */
	public function refresh( array $app, array $credentials ): ?array {
		return $this->renew( $credentials );
	}

	/**
	 * Public profile of the account.
	 *
	 * @param array $credentials Credentials.
	 */
	public function fetch_profile( array $credentials ): array {
		$did = (string) ( $credentials['did'] ?? '' );
		if ( '' === $did ) {
			return array();
		}
		try {
			$data = $this->request( 'GET', self::APP_VIEW . '/app.bsky.actor.getProfile?actor=' . rawurlencode( $did ) );
		} catch ( NetworkException $e ) {
			return array();
		}
		if ( empty( $data['did'] ) ) {
			return array();
		}
		$handle = (string) ( $data['handle'] ?? ( $credentials['handle'] ?? '' ) );
		return array(
			'remote_id'   => (string) $data['did'],
			'name'        => '' !== (string) ( $data['displayName'] ?? '' ) ? (string) $data['displayName'] : $handle,
			'username'    => $handle,
			'avatar'      => (string) ( $data['avatar'] ?? '' ),
			'profile_url' => '' !== $handle ? 'https://bsky.app/profile/' . $handle : '',
		);
	}

	/**
	 * Publishes a post.
	 *
	 * Links and hashtags in the text become facets. Images (up to four, with alt text)
	 * are embedded; a link without images becomes a link card.
	 *
	 * The session is renewed first when its access token is about to run out, and once
	 * more if Bluesky reports it expired. When that happens the result also holds
	 * 'credentials' with the renewed session; the caller saves them with
	 * Accounts::update_credentials(), or the next share has to renew again.
	 *
	 * @param array $credentials ['handle', 'app_password', 'did', 'access_jwt', 'refresh_jwt'].
	 * @param array $payload     Share payload.
	 * @return array ['remote_id', 'remote_url', 'credentials' (only when renewed)].
	 * @throws NetworkException When Bluesky refuses the share. Code 'expired' when the session cannot be renewed.
	 */
	public function publish( array $credentials, array $payload ): array {
		if ( empty( $credentials['did'] ) || empty( $credentials['access_jwt'] ) ) {
			throw new NetworkException( 'expired', esc_html__( 'The Bluesky account is not connected. Reconnect the account.', 'social-integrations' ) );
		}

		$renewed = false;
		if ( $this->jwt_expiring( (string) $credentials['access_jwt'] ) ) {
			$credentials = $this->renew( $credentials );
			$renewed     = true;
		}

		try {
			$result = $this->create_post( $credentials, $payload );
		} catch ( NetworkException $e ) {
			if ( ! $e->is_expired() || $renewed ) {
				throw $e;
			}
			$credentials = $this->renew( $credentials );
			$renewed     = true;
			$result      = $this->create_post( $credentials, $payload );
		}

		if ( $renewed ) {
			$result['credentials'] = $credentials;
		}
		return $result;
	}

	/**
	 * Builds and writes the post record.
	 *
	 * @param array $credentials Session.
	 * @param array $payload     Share payload.
	 * @throws NetworkException When Bluesky refuses.
	 */
	private function create_post( array $credentials, array $payload ): array {
		$jwt  = (string) $credentials['access_jwt'];
		$text = (string) ( $payload['message'] ?? '' );
		if ( mb_strlen( $text ) > $this->char_limit() ) {
			$text = rtrim( mb_substr( $text, 0, $this->char_limit() - 1 ) ) . '…';
		}
		$link = (string) ( $payload['link'] ?? '' );

		$record = array(
			'$type'     => 'app.bsky.feed.post',
			'text'      => $text,
			'createdAt' => gmdate( 'Y-m-d\TH:i:s.000\Z' ),
		);

		$facets = $this->facets( $text );
		if ( ! empty( $facets ) ) {
			$record['facets'] = $facets;
		}

		$images = array();
		foreach ( array_slice( array_values( (array) ( $payload['images'] ?? array() ) ), 0, $this->max_images() ) as $image ) {
			if ( ! is_array( $image ) ) {
				continue;
			}
			$file     = $this->read_image( $image );
			$images[] = array(
				'image' => $this->upload_blob( $jwt, $file ),
				'alt'   => (string) ( $image['alt'] ?? '' ),
			);
		}

		if ( ! empty( $images ) ) {
			$record['embed'] = array(
				'$type'  => 'app.bsky.embed.images',
				'images' => $images,
			);
		} elseif ( '' !== $link ) {
			$record['embed'] = array(
				'$type'    => 'app.bsky.embed.external',
				'external' => $this->link_card( $jwt, $link ),
			);
		}

		$data = $this->request(
			'POST',
			self::PDS . '/com.atproto.repo.createRecord',
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $jwt,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode(
					array(
						'repo'       => (string) $credentials['did'],
						'collection' => 'app.bsky.feed.post',
						'record'     => $record,
					)
				),
			)
		);

		$uri = (string) ( $data['uri'] ?? '' );
		if ( '' === $uri ) {
			throw new NetworkException( 'unknown', esc_html__( 'Bluesky did not confirm the post. Check the profile before trying again.', 'social-integrations' ) );
		}

		$actor = '' !== (string) ( $credentials['handle'] ?? '' ) ? (string) $credentials['handle'] : (string) $credentials['did'];
		$rkey  = substr( (string) strrchr( $uri, '/' ), 1 );

		return array(
			'remote_id'  => $uri,
			'remote_url' => 'https://bsky.app/profile/' . $actor . '/post/' . $rkey,
		);
	}

	/**
	 * Link and hashtag facets. Offsets are UTF-8 byte positions, which is what
	 * preg_match_all() reports.
	 *
	 * @param string $text Post text.
	 */
	private function facets( string $text ): array {
		$facets = array();
		$taken  = array();

		if ( preg_match_all( '~https?://[^\s<>"]+~u', $text, $matches, PREG_OFFSET_CAPTURE ) ) {
			foreach ( $matches[0] as $match ) {
				$url   = rtrim( $match[0], '.,;:!?)]}\'' );
				$start = (int) $match[1];
				$end   = $start + strlen( $url );
				if ( '' === $url ) {
					continue;
				}
				$taken[]  = array( $start, $end );
				$facets[] = array(
					'index'    => array(
						'byteStart' => $start,
						'byteEnd'   => $end,
					),
					'features' => array(
						array(
							'$type' => 'app.bsky.richtext.facet#link',
							'uri'   => $url,
						),
					),
				);
			}
		}

		if ( preg_match_all( '~(?<![\p{L}\p{N}_#/&])#([\p{L}\p{N}_]*[\p{L}_][\p{L}\p{N}_]*)~u', $text, $matches, PREG_OFFSET_CAPTURE ) ) {
			foreach ( $matches[0] as $index => $match ) {
				$start = (int) $match[1];
				$end   = $start + strlen( $match[0] );
				foreach ( $taken as $range ) {
					if ( $start < $range[1] && $end > $range[0] ) {
						continue 2;
					}
				}
				$tag = (string) $matches[1][ $index ][0];
				if ( mb_strlen( $tag ) > 64 ) {
					continue;
				}
				$facets[] = array(
					'index'    => array(
						'byteStart' => $start,
						'byteEnd'   => $end,
					),
					'features' => array(
						array(
							'$type' => 'app.bsky.richtext.facet#tag',
							'tag'   => $tag,
						),
					),
				);
			}
		}

		return $facets;
	}

	/**
	 * Link card from the page's title, description and image.
	 *
	 * @param string $jwt  Access token.
	 * @param string $link URL.
	 */
	private function link_card( string $jwt, string $link ): array {
		$card = array(
			'uri'         => $link,
			'title'       => $link,
			'description' => '',
		);

		$response = wp_remote_get(
			$link,
			array(
				'timeout'             => 10,
				'limit_response_size' => 512 * KB_IN_BYTES,
			)
		);
		if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
			return $card;
		}

		$meta  = $this->meta_tags( (string) wp_remote_retrieve_body( $response ) );
		$title = $meta['og:title'] ?? ( $meta['twitter:title'] ?? ( $meta['title'] ?? '' ) );
		$desc  = $meta['og:description'] ?? ( $meta['description'] ?? '' );
		$thumb = $meta['og:image'] ?? ( $meta['twitter:image'] ?? '' );

		if ( '' !== $title ) {
			$card['title'] = mb_substr( $title, 0, 300 );
		}
		$card['description'] = mb_substr( $desc, 0, 1000 );

		if ( '' !== $thumb && wp_http_validate_url( $thumb ) ) {
			try {
				$card['thumb'] = $this->upload_blob( $jwt, $this->read_image( array( 'url' => $thumb ) ) );
			} catch ( NetworkException $e ) {
				unset( $e );
			}
		}

		return $card;
	}

	/**
	 * Meta tags of an HTML page, keyed by property or name, plus the <title>.
	 *
	 * @param string $html HTML.
	 */
	private function meta_tags( string $html ): array {
		$tags = array();
		if ( preg_match( '~<title[^>]*>(.*?)</title>~is', $html, $m ) ) {
			$tags['title'] = trim( html_entity_decode( wp_strip_all_tags( $m[1] ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
		}
		if ( preg_match_all( '~<meta\s[^>]*>~i', $html, $metas ) ) {
			foreach ( $metas[0] as $meta ) {
				if ( ! preg_match_all( '~([a-z:_-]+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\')~i', $meta, $attrs, PREG_SET_ORDER ) ) {
					continue;
				}
				$values = array();
				foreach ( $attrs as $attr ) {
					$values[ strtolower( $attr[1] ) ] = isset( $attr[3] ) ? $attr[3] : $attr[2];
				}
				$name = strtolower( (string) ( $values['property'] ?? ( $values['name'] ?? '' ) ) );
				if ( '' !== $name && isset( $values['content'] ) && ! isset( $tags[ $name ] ) ) {
					$tags[ $name ] = trim( html_entity_decode( $values['content'], ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
				}
			}
		}
		return $tags;
	}

	/**
	 * Uploads image bytes as a blob and returns the blob reference.
	 *
	 * @param string $jwt  Access token.
	 * @param array  $file ['bytes', 'mime'].
	 * @throws NetworkException When the upload fails.
	 */
	private function upload_blob( string $jwt, array $file ): array {
		$file = $this->shrink( $file );
		$data = $this->request(
			'POST',
			self::PDS . '/com.atproto.repo.uploadBlob',
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $jwt,
					'Content-Type'  => $file['mime'],
				),
				'body'    => $file['bytes'],
				'timeout' => 60,
			)
		);
		if ( empty( $data['blob'] ) || ! is_array( $data['blob'] ) ) {
			throw new NetworkException( 'media', esc_html__( 'Bluesky did not accept an image of the post.', 'social-integrations' ) );
		}
		return $data['blob'];
	}

	/**
	 * Scales an image down to a JPEG when it is larger than Bluesky accepts.
	 *
	 * @param array $file ['bytes', 'mime'].
	 * @throws NetworkException When the image cannot be made small enough.
	 */
	private function shrink( array $file ): array {
		if ( strlen( $file['bytes'] ) <= self::MAX_BLOB ) {
			return $file;
		}
		if ( ! function_exists( 'wp_tempnam' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}

		$source = wp_tempnam( 'sint-bluesky' );
		file_put_contents( $source, $file['bytes'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

		foreach ( array( array( 2000, 82 ), array( 1600, 70 ), array( 1200, 60 ) ) as $step ) {
			$editor = wp_get_image_editor( $source );
			if ( is_wp_error( $editor ) ) {
				break;
			}
			$editor->resize( $step[0], $step[0], false );
			$editor->set_quality( $step[1] );
			$saved = $editor->save( $source . '-small.jpg', 'image/jpeg' );
			if ( is_wp_error( $saved ) || empty( $saved['path'] ) ) {
				break;
			}
			$bytes = (string) file_get_contents( $saved['path'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			wp_delete_file( $saved['path'] );
			if ( '' !== $bytes && strlen( $bytes ) <= self::MAX_BLOB ) {
				$file = array(
					'bytes' => $bytes,
					'mime'  => 'image/jpeg',
				);
				break;
			}
		}

		wp_delete_file( $source );

		if ( strlen( $file['bytes'] ) > self::MAX_BLOB ) {
			throw new NetworkException( 'media', esc_html__( 'An image is larger than Bluesky accepts (1 MB) and could not be made smaller.', 'social-integrations' ) );
		}
		return $file;
	}

	/**
	 * Image bytes, from the local file when there is one, otherwise downloaded.
	 *
	 * @param array $image ['url', 'path'].
	 * @return array ['bytes' => string, 'mime' => string].
	 * @throws NetworkException When the image cannot be read.
	 */
	private function read_image( array $image ): array {
		$path = (string) ( $image['path'] ?? '' );
		if ( '' !== $path && is_readable( $path ) ) {
			$bytes = (string) file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$type  = wp_check_filetype( $path );
			if ( '' !== $bytes ) {
				return array(
					'bytes' => $bytes,
					'mime'  => $type['type'] ? (string) $type['type'] : 'image/jpeg',
				);
			}
		}

		$url = (string) ( $image['url'] ?? '' );
		if ( '' !== $url ) {
			$response = wp_remote_get( $url, array( 'timeout' => 30 ) );
			if ( ! is_wp_error( $response ) && 200 === (int) wp_remote_retrieve_response_code( $response ) ) {
				$bytes = (string) wp_remote_retrieve_body( $response );
				$mime  = strtok( (string) wp_remote_retrieve_header( $response, 'content-type' ), ';' );
				if ( '' !== $bytes ) {
					return array(
						'bytes' => $bytes,
						'mime'  => $mime ? trim( $mime ) : 'image/jpeg',
					);
				}
			}
		}

		throw new NetworkException( 'media', esc_html__( 'An image of the post could not be read, so it was not sent to Bluesky.', 'social-integrations' ) );
	}

	/**
	 * Renews the session: refresh token first, then the app password.
	 *
	 * @param array $credentials Current credentials.
	 * @throws NetworkException With code 'expired' when neither works.
	 */
	private function renew( array $credentials ): array {
		if ( ! empty( $credentials['refresh_jwt'] ) ) {
			try {
				$data = $this->request(
					'POST',
					self::PDS . '/com.atproto.server.refreshSession',
					array( 'headers' => array( 'Authorization' => 'Bearer ' . (string) $credentials['refresh_jwt'] ) )
				);
				if ( ! empty( $data['accessJwt'] ) ) {
					return $this->session_credentials( $data, $credentials );
				}
			} catch ( NetworkException $e ) {
				if ( ! $e->is_expired() && 400 !== $e->getCode() ) {
					throw $e;
				}
			}
		}

		if ( ! empty( $credentials['app_password'] ) ) {
			$identifier = ! empty( $credentials['handle'] ) ? (string) $credentials['handle'] : (string) ( $credentials['did'] ?? '' );
			return $this->create_session( $identifier, (string) $credentials['app_password'] );
		}

		throw new NetworkException( 'expired', esc_html( parent::error_message( 401, array() ) ) );
	}

	/**
	 * Calls createSession.
	 *
	 * @param string $identifier Handle, email or DID.
	 * @param string $password   App password.
	 * @throws NetworkException When Bluesky refuses.
	 */
	private function create_session( string $identifier, string $password ): array {
		$data = $this->request(
			'POST',
			self::PDS . '/com.atproto.server.createSession',
			array(
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'identifier' => $identifier,
						'password'   => $password,
					)
				),
			)
		);
		if ( empty( $data['accessJwt'] ) || empty( $data['did'] ) ) {
			throw new NetworkException( 'expired', esc_html( parent::error_message( 401, array() ) ) );
		}
		return $this->session_credentials( $data, array( 'app_password' => $password ) );
	}

	/**
	 * Credentials from a session answer, keeping the app password.
	 *
	 * @param array $data     Session answer.
	 * @param array $previous Previous credentials.
	 */
	private function session_credentials( array $data, array $previous ): array {
		return array(
			'handle'       => (string) ( $data['handle'] ?? ( $previous['handle'] ?? '' ) ),
			'did'          => (string) ( $data['did'] ?? ( $previous['did'] ?? '' ) ),
			'access_jwt'   => (string) $data['accessJwt'],
			'refresh_jwt'  => (string) ( $data['refreshJwt'] ?? ( $previous['refresh_jwt'] ?? '' ) ),
			'app_password' => (string) ( $previous['app_password'] ?? '' ),
		);
	}

	/**
	 * Whether a JWT runs out within a minute.
	 *
	 * @param string $jwt Token.
	 */
	private function jwt_expiring( string $jwt ): bool {
		$parts = explode( '.', $jwt );
		if ( count( $parts ) < 2 ) {
			return false;
		}
		$json   = base64_decode( strtr( $parts[1], '-_', '+/' ), false ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		$claims = json_decode( (string) $json, true );
		if ( ! is_array( $claims ) || empty( $claims['exp'] ) ) {
			return false;
		}
		return (int) $claims['exp'] < time() + MINUTE_IN_SECONDS;
	}

	/**
	 * Marks session errors as expired.
	 *
	 * @param int   $status HTTP status.
	 * @param array $body   Decoded body.
	 */
	protected function error_code( int $status, array $body ): string {
		if ( in_array( (string) ( $body['error'] ?? '' ), self::EXPIRED_ERRORS, true ) ) {
			return 'expired';
		}
		return parent::error_code( $status, $body );
	}

	/**
	 * Human message for a Bluesky error.
	 *
	 * @param int   $status HTTP status.
	 * @param array $body   Decoded body.
	 */
	protected function error_message( int $status, array $body ): string {
		if ( 'expired' === $this->error_code( $status, $body ) ) {
			return parent::error_message( 401, $body );
		}
		if ( 413 === $status || 'BlobTooLarge' === ( $body['error'] ?? '' ) ) {
			return __( 'An image is larger than Bluesky accepts (1 MB).', 'social-integrations' );
		}
		return parent::error_message( $status, $body );
	}
}
