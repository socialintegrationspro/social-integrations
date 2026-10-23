<?php
/**
 * LinkedIn profile network.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

defined( 'ABSPATH' ) || exit;

/**
 * Posts to the signed-in member's LinkedIn profile through the UGC Posts API.
 *
 * Sign-in uses OpenID Connect on the user's own LinkedIn app. The member ID from
 * /userinfo is the post author (urn:li:person:{id}).
 */
class LinkedIn extends AbstractNetwork {

	const API   = 'https://api.linkedin.com/v2';
	const OAUTH = 'https://www.linkedin.com/oauth/v2';

	/**
	 * Unique key.
	 */
	public function key(): string {
		return 'linkedin';
	}

	/**
	 * Name shown in the UI.
	 */
	public function label(): string {
		return __( 'LinkedIn', 'social-integrations' );
	}

	/**
	 * Maximum caption length.
	 */
	public function char_limit(): int {
		return 3000;
	}

	/**
	 * Brand color.
	 */
	public function color(): string {
		return '#0A66C2';
	}

	/**
	 * Images in one post.
	 */
	public function max_images(): int {
		return 9;
	}

	/**
	 * App fields, with LinkedIn's names for them.
	 */
	public function app_fields(): array {
		return array(
			array(
				'name'  => 'client_id',
				'label' => __( 'Client ID', 'social-integrations' ),
				'type'  => 'text',
			),
			array(
				'name'  => 'client_secret',
				'label' => __( 'Client secret', 'social-integrations' ),
				'type'  => 'password',
			),
		);
	}

	/**
	 * Where the user creates a LinkedIn app.
	 */
	public function app_setup_url(): string {
		return 'https://www.linkedin.com/developers/apps';
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
			self::OAUTH . '/authorization',
			array(
				'response_type' => 'code',
				'client_id'     => (string) ( $app['client_id'] ?? '' ),
				'redirect_uri'  => $redirect_uri,
				'scope'         => 'openid profile w_member_social',
				'state'         => $state,
			)
		);
	}

	/**
	 * Swaps the code for an access token.
	 *
	 * @param array  $app          App fields.
	 * @param string $code         Code from the callback.
	 * @param string $redirect_uri Callback URL.
	 * @throws NetworkException When LinkedIn refuses the code.
	 */
	public function exchange_code( array $app, string $code, string $redirect_uri ): array {
		return $this->token_request(
			array(
				'grant_type'    => 'authorization_code',
				'code'          => $code,
				'redirect_uri'  => $redirect_uri,
				'client_id'     => (string) ( $app['client_id'] ?? '' ),
				'client_secret' => (string) ( $app['client_secret'] ?? '' ),
			)
		);
	}

	/**
	 * Uses the refresh token when the app has one. LinkedIn gives refresh tokens
	 * only to apps it has approved for them; other tokens last 60 days.
	 *
	 * @param array $app         App fields.
	 * @param array $credentials Current credentials.
	 */
	public function refresh( array $app, array $credentials ): ?array {
		if ( empty( $credentials['refresh_token'] ) ) {
			return null;
		}
		$fresh = $this->token_request(
			array(
				'grant_type'    => 'refresh_token',
				'refresh_token' => (string) $credentials['refresh_token'],
				'client_id'     => (string) ( $app['client_id'] ?? '' ),
				'client_secret' => (string) ( $app['client_secret'] ?? '' ),
			)
		);
		if ( empty( $fresh['member_id'] ) && ! empty( $credentials['member_id'] ) ) {
			$fresh['member_id'] = (string) $credentials['member_id'];
		}
		return $fresh;
	}

	/**
	 * Member profile from /userinfo. Its remote_id is the member ID that authors posts.
	 *
	 * @param array $credentials Credentials.
	 */
	public function fetch_profile( array $credentials ): array {
		$data = $this->request(
			'GET',
			self::API . '/userinfo',
			array( 'headers' => $this->headers( (string) ( $credentials['access_token'] ?? '' ) ) )
		);
		if ( empty( $data['sub'] ) ) {
			return array();
		}
		return array(
			'remote_id'   => (string) $data['sub'],
			'name'        => (string) ( $data['name'] ?? '' ),
			'username'    => '',
			'avatar'      => (string) ( $data['picture'] ?? '' ),
			'profile_url' => '',
		);
	}

	/**
	 * Publishes a post on the member's profile.
	 *
	 * Images become an IMAGE post (each image uploaded first). A link without images
	 * becomes an ARTICLE post with a preview card. Otherwise a text post.
	 *
	 * @param array $credentials ['access_token', 'member_id'].
	 * @param array $payload     Share payload.
	 * @throws NetworkException When LinkedIn refuses the share.
	 */
	public function publish( array $credentials, array $payload ): array {
		$token  = (string) ( $credentials['access_token'] ?? '' );
		$member = (string) ( $credentials['member_id'] ?? '' );
		if ( '' === $member && '' !== $token ) {
			$profile = $this->fetch_profile( $credentials );
			$member  = (string) ( $profile['remote_id'] ?? '' );
		}
		if ( '' === $token || '' === $member ) {
			throw new NetworkException( 'expired', esc_html__( 'The LinkedIn account is not connected. Reconnect the account.', 'social-integrations' ) );
		}

		$author  = 'urn:li:person:' . $member;
		$text    = (string) ( $payload['message'] ?? '' );
		$link    = (string) ( $payload['link'] ?? '' );
		$content = $this->share_content( $token, $author, $text, $link, (array) ( $payload['images'] ?? array() ) );

		$data = $this->request(
			'POST',
			self::API . '/ugcPosts',
			array(
				'headers' => $this->headers( $token, 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'author'          => $author,
						'lifecycleState'  => 'PUBLISHED',
						'specificContent' => array( 'com.linkedin.ugc.ShareContent' => $content ),
						'visibility'      => array( 'com.linkedin.ugc.MemberNetworkVisibility' => 'PUBLIC' ),
					)
				),
			)
		);

		$post_id = (string) ( $data['id'] ?? '' );
		if ( '' === $post_id ) {
			throw new NetworkException( 'unknown', esc_html__( 'LinkedIn did not confirm the post. Check the profile before trying again.', 'social-integrations' ) );
		}

		return array(
			'remote_id'  => $post_id,
			'remote_url' => 'https://www.linkedin.com/feed/update/' . $post_id . '/',
		);
	}

	/**
	 * The ShareContent of a ugcPosts request: the text, plus the images or the link.
	 *
	 * @param string $token  Access token.
	 * @param string $author Author URN.
	 * @param string $text   Caption.
	 * @param string $link   Post link.
	 * @param array  $images Payload images.
	 * @throws NetworkException When an image upload fails.
	 */
	private function share_content( string $token, string $author, string $text, string $link, array $images ): array {
		$images  = array_slice( array_values( $images ), 0, $this->max_images() );
		$content = array(
			'shareCommentary'    => array( 'text' => $text ),
			'shareMediaCategory' => 'NONE',
		);

		if ( ! empty( $images ) ) {
			$media = array();
			foreach ( $images as $image ) {
				if ( ! is_array( $image ) ) {
					continue;
				}
				$item = array(
					'status' => 'READY',
					'media'  => $this->upload_image( $token, $author, $image ),
				);
				if ( ! empty( $image['alt'] ) ) {
					$item['description'] = array( 'text' => (string) $image['alt'] );
				}
				$media[] = $item;
			}
			if ( ! empty( $media ) ) {
				$content['shareMediaCategory'] = 'IMAGE';
				$content['media']              = $media;
			}
		} elseif ( '' !== $link ) {
			$content['shareMediaCategory'] = 'ARTICLE';
			$content['media']              = array(
				array(
					'status'      => 'READY',
					'originalUrl' => $link,
				),
			);
		}
		return $content;
	}

	/**
	 * Registers an upload, sends the image bytes and returns the asset URN.
	 *
	 * @param string $token  Access token.
	 * @param string $author Member URN.
	 * @param array  $image  ['url', 'alt', 'path'].
	 * @throws NetworkException When the upload fails.
	 */
	private function upload_image( string $token, string $author, array $image ): string {
		$file = $this->read_image( $image );

		$register = $this->request(
			'POST',
			self::API . '/assets?action=registerUpload',
			array(
				'headers' => $this->headers( $token, 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'registerUploadRequest' => array(
							'recipes'              => array( 'urn:li:digitalmediaRecipe:feedshare-image' ),
							'owner'                => $author,
							'serviceRelationships' => array(
								array(
									'relationshipType' => 'OWNER',
									'identifier'       => 'urn:li:userGeneratedContent',
								),
							),
						),
					)
				),
			)
		);

		$asset      = (string) ( $register['value']['asset'] ?? '' );
		$upload_url = (string) ( $register['value']['uploadMechanism']['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']['uploadUrl'] ?? '' );
		if ( '' === $asset || '' === $upload_url ) {
			throw new NetworkException( 'media', esc_html__( 'LinkedIn did not accept the image upload. Try again later.', 'social-integrations' ) );
		}

		$this->request(
			'PUT',
			$upload_url,
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => $file['mime'],
				),
				'body'    => $file['bytes'],
				'timeout' => 60,
			)
		);

		return $asset;
	}


	/**
	 * Calls the token endpoint and normalizes the answer.
	 *
	 * @param array $body Form fields.
	 * @throws NetworkException When LinkedIn refuses.
	 */
	private function token_request( array $body ): array {
		$data = $this->request(
			'POST',
			self::OAUTH . '/accessToken',
			array(
				'headers' => array( 'Content-Type' => 'application/x-www-form-urlencoded' ),
				'body'    => $body,
			)
		);
		if ( empty( $data['access_token'] ) ) {
			throw new NetworkException( 'oauth', esc_html__( 'LinkedIn did not return an access token. Try connecting again.', 'social-integrations' ) );
		}

		$credentials = $this->with_expiry( array( 'access_token' => (string) $data['access_token'] ), $data );
		if ( ! empty( $data['refresh_token'] ) ) {
			$credentials['refresh_token'] = (string) $data['refresh_token'];
		}

		// The member ID is needed to author posts; read it once here.
		try {
			$profile = $this->fetch_profile( $credentials );
			if ( ! empty( $profile['remote_id'] ) ) {
				$credentials['member_id'] = (string) $profile['remote_id'];
			}
		} catch ( NetworkException $e ) {
			unset( $e );
		}

		return $credentials;
	}

	/**
	 * Request headers.
	 *
	 * @param string $token        Access token.
	 * @param string $content_type Content type, if any.
	 */
	private function headers( string $token, string $content_type = '' ): array {
		$headers = array(
			'Authorization'             => 'Bearer ' . $token,
			'X-Restli-Protocol-Version' => '2.0.0',
		);
		if ( '' !== $content_type ) {
			$headers['Content-Type'] = $content_type;
		}
		return $headers;
	}

	/**
	 * Human message for a LinkedIn error.
	 *
	 * @param int   $status HTTP status.
	 * @param array $body   Decoded body.
	 */
	protected function error_message( int $status, array $body ): string {
		if ( 401 !== $status && empty( $body['message'] ) && ! empty( $body['error_description'] ) ) {
			$body['message'] = (string) $body['error_description'];
		}
		return parent::error_message( $status, $body );
	}
}
