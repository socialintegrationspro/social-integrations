<?php
/**
 * Facebook Page network.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Networks;

defined( 'ABSPATH' ) || exit;

/**
 * Posts to a Facebook Page through the Graph API.
 *
 * The user signs in with their own Meta app. One sign-in lists the Pages the user
 * manages (directly or through a Business Portfolio); each Page brings its own
 * Page access token, which is what the account stores.
 */
class Facebook extends AbstractNetwork {

	const GRAPH_VERSION = 'v23.0';
	const GRAPH         = 'https://graph.facebook.com/' . self::GRAPH_VERSION;
	const DIALOG        = 'https://www.facebook.com/' . self::GRAPH_VERSION . '/dialog/oauth';

	/**
	 * Graph error codes that mean the token no longer works.
	 */
	const EXPIRED_CODES = array( 190, 102 );

	/**
	 * Unique key.
	 */
	public function key(): string {
		return 'facebook';
	}

	/**
	 * Name shown in the UI.
	 */
	public function label(): string {
		return __( 'Facebook Page', 'social-integrations' );
	}

	/**
	 * Maximum caption length.
	 */
	public function char_limit(): int {
		return 63206;
	}

	/**
	 * Brand color.
	 */
	public function color(): string {
		return '#1877F2';
	}

	/**
	 * Images in one post.
	 */
	public function max_images(): int {
		return 10;
	}

	/**
	 * Where the user creates a Meta app.
	 */
	public function app_setup_url(): string {
		return 'https://developers.facebook.com/apps/';
	}

	/**
	 * Permissions requested at sign-in.
	 *
	 * The first three list Pages and post to them; business_management also lists
	 * Pages owned by a Business Portfolio.
	 */
	protected function scopes(): array {
		return array( 'pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'business_management' );
	}

	/**
	 * Sign-in URL.
	 *
	 * @param array  $app          App fields.
	 * @param string $redirect_uri Callback URL.
	 * @param string $state        Anti-forgery state.
	 */
	public function authorization_url( array $app, string $redirect_uri, string $state ): string {
		return self::DIALOG . '?' . http_build_query(
			array(
				'client_id'     => (string) ( $app['client_id'] ?? '' ),
				'redirect_uri'  => $redirect_uri,
				'scope'         => implode( ',', $this->scopes() ),
				'state'         => $state,
				'response_type' => 'code',
			),
			'',
			'&',
			PHP_QUERY_RFC3986
		);
	}

	/**
	 * Swaps the code for a long-lived user token.
	 *
	 * @param array  $app          App fields.
	 * @param string $code         Code from the callback.
	 * @param string $redirect_uri Callback URL.
	 * @throws NetworkException When Facebook refuses the code.
	 */
	public function exchange_code( array $app, string $code, string $redirect_uri ): array {
		$short = $this->graph_get(
			'/oauth/access_token',
			array(
				'client_id'     => (string) ( $app['client_id'] ?? '' ),
				'client_secret' => (string) ( $app['client_secret'] ?? '' ),
				'redirect_uri'  => $redirect_uri,
				'code'          => $code,
			)
		);
		if ( empty( $short['access_token'] ) ) {
			throw new NetworkException( 'oauth', esc_html__( 'Facebook did not return an access token. Try connecting again.', 'social-integrations' ) );
		}

		$credentials = array( 'access_token' => (string) $short['access_token'] );

		// A long-lived user token makes the Page tokens derived from it long-lived too.
		try {
			$long = $this->graph_get(
				'/oauth/access_token',
				array(
					'grant_type'        => 'fb_exchange_token',
					'client_id'         => (string) ( $app['client_id'] ?? '' ),
					'client_secret'     => (string) ( $app['client_secret'] ?? '' ),
					'fb_exchange_token' => $credentials['access_token'],
				)
			);
			if ( ! empty( $long['access_token'] ) ) {
				$credentials['access_token'] = (string) $long['access_token'];
				if ( ! empty( $long['expires_in'] ) ) {
					$credentials['expires_at'] = time() + (int) $long['expires_in'];
				}
			}
		} catch ( NetworkException $e ) {
			// The short-lived token still lists the Pages; keep it.
			unset( $e );
		}

		return $credentials;
	}

	/**
	 * Profile of the token's owner. For a Page token this is the Page.
	 *
	 * @param array $credentials Credentials.
	 */
	public function fetch_profile( array $credentials ): array {
		$node = $this->graph_get(
			'/me',
			array(
				'fields'       => 'id,name,picture.width(200).height(200)',
				'access_token' => (string) ( $credentials['access_token'] ?? '' ),
			)
		);
		return empty( $node['id'] ) ? array() : $this->profile_from_node( $node );
	}

	/**
	 * Pages the signed-in user manages, each with its Page access token.
	 *
	 * @param array $credentials User credentials.
	 */
	public function connectable_entities( array $credentials ): ?array {
		$token  = (string) ( $credentials['access_token'] ?? '' );
		$fields = 'id,name,access_token,picture.width(200).height(200)';
		$pages  = array();

		$this->collect_pages(
			$this->graph_get(
				'/me/accounts',
				array(
					'fields'       => $fields,
					'limit'        => 200,
					'access_token' => $token,
				)
			),
			$pages
		);

		// Pages owned by a Business Portfolio do not show up in /me/accounts.
		try {
			$businesses = $this->graph_get(
				'/me/businesses',
				array(
					'fields'       => 'id,name',
					'limit'        => 100,
					'access_token' => $token,
				)
			);
		} catch ( NetworkException $e ) {
			$businesses = array();
		}

		foreach ( (array) ( $businesses['data'] ?? array() ) as $business ) {
			if ( empty( $business['id'] ) ) {
				continue;
			}
			foreach ( array( 'owned_pages', 'client_pages' ) as $edge ) {
				try {
					$this->collect_pages(
						$this->graph_get(
							'/' . rawurlencode( (string) $business['id'] ) . '/' . $edge,
							array(
								'fields'       => $fields,
								'limit'        => 200,
								'access_token' => $token,
							)
						),
						$pages
					);
				} catch ( NetworkException $e ) {
					continue;
				}
			}
		}

		return array_values( $pages );
	}

	/**
	 * Publishes to the Page.
	 *
	 * Text and link go to /{page-id}/feed. One image goes to /{page-id}/photos with
	 * the text as its caption. Several images are uploaded unpublished, then attached
	 * to one feed post.
	 *
	 * @param array $credentials ['page_id', 'access_token'].
	 * @param array $payload     Share payload.
	 * @throws NetworkException When Facebook refuses the share.
	 */
	public function publish( array $credentials, array $payload ): array {
		$page_id = (string) ( $credentials['page_id'] ?? '' );
		$token   = (string) ( $credentials['access_token'] ?? '' );
		if ( '' === $page_id || '' === $token ) {
			throw new NetworkException( 'expired', esc_html__( 'The Facebook Page is not connected. Reconnect the account.', 'social-integrations' ) );
		}

		$message = (string) ( $payload['message'] ?? '' );
		$link    = (string) ( $payload['link'] ?? '' );
		$images  = $this->image_urls( $payload );
		$base    = '/' . rawurlencode( $page_id );

		if ( 1 === count( $images ) ) {
			$node    = $this->graph_post(
				$base . '/photos',
				array(
					'url'          => $images[0],
					'caption'      => $message,
					'access_token' => $token,
				)
			);
			$post_id = (string) ( $node['post_id'] ?? $node['id'] ?? '' );
		} elseif ( count( $images ) > 1 ) {
			$post_id = $this->post_photos( $base, $token, $images, $message );
		} else {
			$body = array(
				'message'      => $message,
				'access_token' => $token,
			);
			if ( '' !== $link ) {
				$body['link'] = $link;
			}
			$node    = $this->graph_post( $base . '/feed', $body );
			$post_id = (string) ( $node['id'] ?? '' );
		}

		if ( '' === $post_id ) {
			throw new NetworkException( 'unknown', esc_html__( 'Facebook did not confirm the post. Check the Page before trying again.', 'social-integrations' ) );
		}

		return array(
			'remote_id'  => $post_id,
			'remote_url' => 'https://www.facebook.com/' . rawurlencode( $post_id ),
		);
	}

	/**
	 * Uploads the images unpublished, then posts them together on the Page feed.
	 *
	 * @param string   $base    '/{page-id}'.
	 * @param string   $token   Page token.
	 * @param string[] $images  Image URLs.
	 * @param string   $message Caption.
	 * @return string Post ID, or '' when Facebook does not give one.
	 * @throws NetworkException When Facebook refuses an upload or the post.
	 */
	private function post_photos( string $base, string $token, array $images, string $message ): string {
		$body = array(
			'message'      => $message,
			'access_token' => $token,
		);
		foreach ( $images as $index => $url ) {
			$photo = $this->graph_post(
				$base . '/photos',
				array(
					'url'          => $url,
					'published'    => 'false',
					'access_token' => $token,
				)
			);
			if ( ! empty( $photo['id'] ) ) {
				$body[ 'attached_media[' . $index . ']' ] = (string) wp_json_encode( array( 'media_fbid' => (string) $photo['id'] ) );
			}
		}
		$node = $this->graph_post( $base . '/feed', $body );
		return (string) ( $node['id'] ?? '' );
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



	/**
	 * Adds Pages from a Graph list to $pages, keyed by ID. Pages without a token are skipped.
	 *
	 * @param array $response Graph list.
	 * @param array $pages    Pages found so far.
	 */
	private function collect_pages( array $response, array &$pages ): void {
		foreach ( (array) ( $response['data'] ?? array() ) as $page ) {
			$id = (string) ( $page['id'] ?? '' );
			if ( '' === $id || empty( $page['access_token'] ) || isset( $pages[ $id ] ) ) {
				continue;
			}
			$profile      = $this->profile_from_node( $page );
			$pages[ $id ] = $profile + array(
				'credentials' => array(
					'page_id'      => $id,
					'access_token' => (string) $page['access_token'],
				),
			);
		}
	}

	/**
	 * Account profile from a Graph node.
	 *
	 * @param array $node Graph node.
	 */
	private function profile_from_node( array $node ): array {
		$id = (string) ( $node['id'] ?? '' );
		return array(
			'remote_id'   => $id,
			'name'        => (string) ( $node['name'] ?? '' ),
			'username'    => '',
			'avatar'      => (string) ( $node['picture']['data']['url'] ?? '' ),
			'profile_url' => 'https://www.facebook.com/' . rawurlencode( $id ),
		);
	}

	/**
	 * GET a Graph path.
	 *
	 * @param string $path  Path.
	 * @param array  $query Query arguments.
	 */
	private function graph_get( string $path, array $query ): array {
		return $this->request( 'GET', self::GRAPH . $path . '?' . http_build_query( $query, '', '&', PHP_QUERY_RFC3986 ) );
	}

	/**
	 * POST a form to a Graph path.
	 *
	 * @param string $path Path.
	 * @param array  $body Form fields.
	 */
	private function graph_post( string $path, array $body ): array {
		return $this->request( 'POST', self::GRAPH . $path, array( 'body' => $body ) );
	}
}
