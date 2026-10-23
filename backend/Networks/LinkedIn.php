<?php
/**
 * LinkedIn profile network.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

defined( 'ABSPATH' ) || exit;

/**
 * Posts to the signed-in member's LinkedIn profile through the Posts API and the Images API.
 *
 * Sign-in uses OpenID Connect on the user's own LinkedIn app. The member ID from
 * /userinfo is the post author (urn:li:person:{id}).
 */
class LinkedIn extends AbstractNetwork {

	const API   = 'https://api.linkedin.com/v2';
	const REST  = 'https://api.linkedin.com/rest';
	const OAUTH = 'https://www.linkedin.com/oauth/v2';

	// The version of the versioned API (YYYYMM). LinkedIn supports each version for about one year.
	const VERSION = '202610';

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
	 * Post format, link card, visibility and first comment.
	 */
	public function post_fields(): array {
		return array(
			$this->format_field(),
			$this->title_field( 400 ),
			$this->description_field( 4000 ),
			$this->visibility_field(),
			$this->first_comment_field(),
		);
	}

	/**
	 * Field: who can see the post.
	 */
	protected function visibility_field(): array {
		return array(
			'name'    => 'visibility',
			'label'   => __( 'Who can see the post', 'social-integrations' ),
			'type'    => 'select',
			'default' => 'PUBLIC',
			'options' => array(
				array(
					'value' => 'PUBLIC',
					'label' => __( 'Anyone', 'social-integrations' ),
				),
				array(
					'value' => 'CONNECTIONS',
					'label' => __( 'Connections only', 'social-integrations' ),
				),
			),
		);
	}

	/**
	 * Adds a comment below the post, as the author of the post.
	 *
	 * @param array  $credentials ['access_token', 'member_id'].
	 * @param array  $post        What publish() returned.
	 * @param string $text        Comment text.
	 * @throws NetworkException When LinkedIn refuses the comment.
	 */
	public function comment( array $credentials, array $post, string $text ): array {
		$urn  = (string) $post['remote_id'];
		$data = $this->request(
			'POST',
			self::REST . '/socialActions/' . rawurlencode( $urn ) . '/comments',
			array(
				'headers' => $this->rest_headers( (string) ( $credentials['access_token'] ?? '' ), 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'actor'   => $this->author_urn( $credentials ),
						'object'  => $urn,
						'message' => array( 'text' => $text ),
					)
				),
			)
		);
		return array( 'remote_id' => (string) ( $data['id'] ?? $this->last_header( 'x-restli-id' ) ) );
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
	 * Permissions that the sign-in requests.
	 */
	protected function scopes(): array {
		return array( 'openid', 'profile', 'w_member_social' );
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
				'scope'         => implode( ' ', $this->scopes() ),
				'state'         => $state,
			)
		);
	}

	/**
	 * Exchanges the code for an access token.
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
	 * only to apps that it approved for them; other tokens last 60 days.
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
	 * One image becomes an image post and more images a multi-image post; the method uploads
	 * each image first. A link without images becomes an article post with a preview card.
	 * Otherwise a text post.
	 *
	 * @param array $credentials ['access_token', 'member_id'].
	 * @param array $payload     Share payload.
	 * @throws NetworkException When LinkedIn refuses the share.
	 */
	public function publish( array $credentials, array $payload ): array {
		$token  = (string) ( $credentials['access_token'] ?? '' );
		$author = '' !== $token ? $this->author_urn( $credentials ) : '';
		if ( '' === $author ) {
			throw new NetworkException( 'expired', esc_html__( 'The LinkedIn account is not connected. Reconnect the account.', 'social-integrations' ) );
		}

		$post    = array(
			'author'                    => $author,
			'commentary'                => self::little_text( (string) ( $payload['message'] ?? '' ) ),
			'visibility'                => $this->field( $payload, 'visibility' ),
			'distribution'              => array(
				'feedDistribution'               => 'MAIN_FEED',
				'targetEntities'                 => array(),
				'thirdPartyDistributionChannels' => array(),
			),
			'lifecycleState'            => 'PUBLISHED',
			'isReshareDisabledByAuthor' => false,
		);
		$content = $this->post_content( $token, $author, (string) ( $payload['link'] ?? '' ), (array) ( $payload['images'] ?? array() ) );
		// The link card title and description from the post fields replace the ones from the post.
		foreach ( array( 'title', 'description' ) as $name ) {
			$value = $this->field( $payload, $name );
			if ( isset( $content['article'] ) && '' !== $value ) {
				$content['article'][ $name ] = $value;
			}
		}
		if ( $content ) {
			$post['content'] = $content;
		}

		$this->request(
			'POST',
			self::REST . '/posts',
			array(
				'headers' => $this->rest_headers( $token, 'application/json' ),
				'body'    => wp_json_encode( $post ),
			)
		);

		// LinkedIn answers 201 with an empty body; the post URN is in a header.
		$post_id = $this->last_header( 'x-restli-id' );
		if ( '' === $post_id ) {
			throw new NetworkException( 'unknown', esc_html__( 'LinkedIn did not confirm the post. Check the account before you try again.', 'social-integrations' ) );
		}

		return array(
			'remote_id'  => $post_id,
			'remote_url' => 'https://www.linkedin.com/feed/update/' . $post_id . '/',
		);
	}

	/**
	 * The URN that authors the post: the member. Empty when it is not known.
	 *
	 * @param array $credentials ['access_token', 'member_id'].
	 */
	protected function author_urn( array $credentials ): string {
		$member = (string) ( $credentials['member_id'] ?? '' );
		if ( '' === $member ) {
			$profile = $this->fetch_profile( $credentials );
			$member  = (string) ( $profile['remote_id'] ?? '' );
		}
		return '' !== $member ? 'urn:li:person:' . $member : '';
	}

	/**
	 * Text in the "little" format of the Posts API. The format reserves | { } @ [ ] ( ) < > # \ * _ ~,
	 * so each of them gets a backslash. A hashtag (#word) stays as it is, so LinkedIn links it.
	 *
	 * @param string $text Caption.
	 */
	protected static function little_text( string $text ): string {
		$parts = preg_split( '/(#[\p{L}\p{N}_]+)/u', $text, -1, PREG_SPLIT_DELIM_CAPTURE );
		$out   = '';
		foreach ( (array) $parts as $i => $part ) {
			$out .= 1 === $i % 2 ? $part : (string) preg_replace( '/([|{}@\[\]()<>#\\\\*_~])/u', '\\\\$1', (string) $part );
		}
		return $out;
	}

	/**
	 * The content of the post: the images, or the link as an article. Empty for a text post.
	 *
	 * @param string $token  Access token.
	 * @param string $author Author URN.
	 * @param string $link   Post link.
	 * @param array  $images Payload images.
	 * @throws NetworkException When an image upload fails.
	 */
	protected function post_content( string $token, string $author, string $link, array $images ): array {
		$media = array();
		foreach ( array_slice( array_values( $images ), 0, $this->max_images() ) as $image ) {
			if ( ! is_array( $image ) ) {
				continue;
			}
			$item = array( 'id' => $this->upload_image( $token, $author, $image ) );
			if ( ! empty( $image['alt'] ) ) {
				$item['altText'] = (string) $image['alt'];
			}
			$media[] = $item;
		}

		if ( 1 === count( $media ) ) {
			return array( 'media' => $media[0] );
		}
		if ( count( $media ) > 1 ) {
			return array( 'multiImage' => array( 'images' => $media ) );
		}
		if ( '' !== $link ) {
			return array( 'article' => $this->article( $token, $author, $link ) );
		}
		return array();
	}

	/**
	 * An article for a link. The Posts API does not read the page, so the article needs its own
	 * title. A link to a post of this site uses the post title, excerpt and featured image;
	 * another link uses its host name as the title.
	 *
	 * @param string $token  Access token.
	 * @param string $author Author URN.
	 * @param string $link   Link.
	 */
	protected function article( string $token, string $author, string $link ): array {
		$article = array(
			'source' => $link,
			'title'  => (string) wp_parse_url( $link, PHP_URL_HOST ),
		);
		$post_id = url_to_postid( $link );
		if ( ! $post_id ) {
			return $article;
		}

		$title = wp_strip_all_tags( get_the_title( $post_id ) );
		if ( '' !== $title ) {
			$article['title'] = mb_substr( $title, 0, 399 );
		}
		$excerpt = wp_strip_all_tags( get_the_excerpt( $post_id ) );
		if ( '' !== $excerpt ) {
			$article['description'] = mb_substr( $excerpt, 0, 4000 );
		}
		$thumbnail = (int) get_post_thumbnail_id( $post_id );
		if ( $thumbnail ) {
			try {
				$article['thumbnail'] = $this->upload_image(
					$token,
					$author,
					array(
						'url'  => (string) wp_get_attachment_url( $thumbnail ),
						'path' => (string) get_attached_file( $thumbnail ),
					)
				);
			} catch ( NetworkException $e ) {
				// The article works without a thumbnail.
				unset( $e );
			}
		}
		return $article;
	}

	/**
	 * Starts an upload with the Images API, sends the image bytes and returns the image URN.
	 *
	 * @param string $token  Access token.
	 * @param string $author Owner of the image: the author URN.
	 * @param array  $image  ['url', 'alt', 'path'].
	 * @throws NetworkException When the upload fails.
	 */
	protected function upload_image( string $token, string $author, array $image ): string {
		$file = $this->read_image( $image );

		$start = $this->request(
			'POST',
			self::REST . '/images?action=initializeUpload',
			array(
				'headers' => $this->rest_headers( $token, 'application/json' ),
				'body'    => wp_json_encode( array( 'initializeUploadRequest' => array( 'owner' => $author ) ) ),
			)
		);

		$urn        = (string) ( $start['value']['image'] ?? '' );
		$upload_url = (string) ( $start['value']['uploadUrl'] ?? '' );
		if ( '' === $urn || '' === $upload_url ) {
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

		return $urn;
	}

	/**
	 * Calls the token endpoint and normalizes the answer.
	 *
	 * @param array $body Form fields.
	 * @throws NetworkException When LinkedIn refuses.
	 */
	protected function token_request( array $body ): array {
		$data = $this->request(
			'POST',
			self::OAUTH . '/accessToken',
			array(
				'headers' => array( 'Content-Type' => 'application/x-www-form-urlencoded' ),
				'body'    => $body,
			)
		);
		if ( empty( $data['access_token'] ) ) {
			throw new NetworkException( 'oauth', esc_html__( 'LinkedIn did not return an access token. Connect again.', 'social-integrations' ) );
		}

		$credentials = $this->with_expiry( array( 'access_token' => (string) $data['access_token'] ), $data );
		if ( ! empty( $data['refresh_token'] ) ) {
			$credentials['refresh_token'] = (string) $data['refresh_token'];
		}
		return $this->complete_credentials( $credentials );
	}

	/**
	 * Posts need the member ID as the author; reads it once.
	 *
	 * @param array $credentials Credentials.
	 */
	public function complete_credentials( array $credentials ): array {
		if ( ! empty( $credentials['member_id'] ) ) {
			return $credentials;
		}
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
	protected function headers( string $token, string $content_type = '' ): array {
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
	 * Request headers of the versioned API.
	 *
	 * @param string $token        Access token.
	 * @param string $content_type Content type, if any.
	 */
	protected function rest_headers( string $token, string $content_type = '' ): array {
		return $this->headers( $token, $content_type ) + array( 'LinkedIn-Version' => self::VERSION );
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
