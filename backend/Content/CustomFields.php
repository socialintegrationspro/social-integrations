<?php
/**
 * Custom fields of posts, for {field:key} in templates.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Content;

use SocialIntegrations\Hooks;

defined( 'ABSPATH' ) || exit;

/**
 * Lists the custom fields of a post type, and gives the value of a field as text or as media.
 *
 * When Advanced Custom Fields is active, the plugin reads a field through ACF. Then dates,
 * choices and yes / no fields show as the site shows them.
 */
final class CustomFields {

	/**
	 * Posts of a post type that the plugin reads to find its fields.
	 */
	const SAMPLE_POSTS = 20;

	/**
	 * Fields with a name that starts with '_' are internal, except these.
	 */
	const PUBLIC_INTERNAL = array( '_sku', '_stock' );

	/**
	 * The fields of a post type, read from its latest posts.
	 *
	 * @param string $type Post type name.
	 * @return array<int, array{key: string, label: string, media: bool, sample: string}>
	 */
	public static function of_type( string $type ): array {
		$ids = get_posts(
			array(
				'post_type'      => $type,
				'post_status'    => 'publish',
				'posts_per_page' => self::SAMPLE_POSTS,
				'fields'         => 'ids',
				'no_found_rows'  => true,
			)
		);

		$fields = array();
		foreach ( $ids as $id ) {
			foreach ( (array) get_post_meta( (int) $id ) as $key => $values ) {
				$key = (string) $key;
				if ( isset( $fields[ $key ] ) || ! self::shown( $key, $values ) ) {
					continue;
				}
				$post           = get_post( (int) $id );
				$object         = self::acf_field( $key, (int) $id );
				$fields[ $key ] = array(
					'key'    => $key,
					'label'  => $object && ! empty( $object['label'] ) ? (string) $object['label'] : self::label( $key ),
					'media'  => self::is_media( $key, $object ) && count( self::media( $post, $key ) ) > 0,
					'sample' => mb_substr( self::value( $post, $key ), 0, 80 ),
				);
			}
		}

		usort(
			$fields,
			static function ( $a, $b ) {
				return strcasecmp( $a['label'], $b['label'] );
			}
		);

		/**
		 * Filter. The custom fields the app offers for a post type.
		 *
		 * @param array  $fields Fields: key, label, media, sample.
		 * @param string $type   Post type name.
		 */
		return array_values( (array) apply_filters( Hooks::CUSTOM_FIELDS, $fields, $type ) );
	}

	/**
	 * The value of a field as text for a caption or a link.
	 *
	 * @param \WP_Post $post Post.
	 * @param string   $key  Field name.
	 */
	public static function value( \WP_Post $post, string $key ): string {
		$value = self::acf_field( $key, $post->ID ) ? get_field( $key, $post->ID ) : get_post_meta( $post->ID, $key, true );
		return trim( self::text( $value ) );
	}

	/**
	 * Images and videos in a field: an attachment ID, a list of IDs, an ACF image or gallery, or a URL of the media library.
	 *
	 * @param \WP_Post|null $post Post.
	 * @param string        $key  Field name.
	 * @return array<int, array> Media items.
	 */
	public static function media( ?\WP_Post $post, string $key ): array {
		if ( ! $post ) {
			return array();
		}
		$raw   = get_post_meta( $post->ID, $key, true );
		$items = array();
		foreach ( is_array( $raw ) ? $raw : array( $raw ) as $part ) {
			if ( is_array( $part ) ) {
				$part = $part['ID'] ?? ( $part['id'] ?? ( $part['url'] ?? '' ) );
			}
			$id = 0;
			if ( is_numeric( $part ) ) {
				$id = (int) $part;
			} elseif ( is_string( $part ) && wp_http_validate_url( $part ) ) {
				$id = attachment_url_to_postid( $part );
			} elseif ( is_string( $part ) && false !== strpos( $part, ',' ) ) {
				// WooCommerce and other plugins keep a list of IDs as text: '12,15,18'.
				foreach ( array_map( 'intval', explode( ',', $part ) ) as $one ) {
					$item = $one > 0 && 'attachment' === get_post_type( $one ) ? ShareBuilder::attachment( $one ) : null;
					if ( $item ) {
						$items[] = $item;
					}
				}
				continue;
			}
			$item = $id > 0 && 'attachment' === get_post_type( $id ) ? ShareBuilder::attachment( $id ) : null;
			if ( $item ) {
				$items[] = $item;
			}
		}
		return $items;
	}

	/**
	 * A value as text. A list becomes words with commas; a choice, a link, a post, a term or a user becomes its name.
	 *
	 * @param mixed $value Value.
	 */
	public static function text( $value ): string {
		if ( is_bool( $value ) ) {
			return $value ? __( 'Yes', 'social-integrations' ) : __( 'No', 'social-integrations' );
		}
		if ( is_scalar( $value ) ) {
			return html_entity_decode( wp_strip_all_tags( (string) $value ), ENT_QUOTES, 'UTF-8' );
		}
		if ( $value instanceof \WP_Post ) {
			return PostTypes::title( $value );
		}
		if ( $value instanceof \WP_Term ) {
			return $value->name;
		}
		if ( $value instanceof \WP_User ) {
			return $value->display_name;
		}
		if ( ! is_array( $value ) ) {
			return '';
		}
		// One item with a name: a choice with label and value, a link, or an image.
		foreach ( array( 'label', 'title', 'name', 'url' ) as $name ) {
			if ( isset( $value[ $name ] ) && is_scalar( $value[ $name ] ) && ! isset( $value[0] ) ) {
				return self::text( $value[ $name ] );
			}
		}
		$parts = array();
		foreach ( $value as $item ) {
			$text = trim( self::text( $item ) );
			if ( '' !== $text ) {
				$parts[] = $text;
			}
		}
		return implode( ', ', $parts );
	}

	/**
	 * Whether the app offers a field: not internal, not a value of this plugin, and with a value.
	 *
	 * @param string $key    Field name.
	 * @param array  $values Stored values.
	 */
	private static function shown( string $key, array $values ): bool {
		if ( 0 === strpos( $key, '_' ) && ! in_array( $key, self::PUBLIC_INTERNAL, true ) ) {
			return false;
		}
		$first = $values[0] ?? '';
		return '' !== $first && null !== $first;
	}

	/**
	 * Whether a field holds media. A number can be an attachment ID by chance, so the ACF type
	 * or the field name must say so.
	 *
	 * @param string     $key   Field name.
	 * @param array|null $field ACF field object.
	 */
	private static function is_media( string $key, ?array $field ): bool {
		if ( $field ) {
			return in_array( $field['type'] ?? '', array( 'image', 'gallery', 'file' ), true );
		}
		return (bool) preg_match( '/image|photo|picture|gallery|thumbnail|logo|banner|cover|video|media/i', $key );
	}

	/**
	 * The ACF field object for a field name on a post, or null when ACF does not know the field.
	 *
	 * @param string $key Field name.
	 * @param int    $id  Post ID.
	 */
	private static function acf_field( string $key, int $id ): ?array {
		if ( ! function_exists( 'get_field_object' ) || ! function_exists( 'get_field' ) ) {
			return null;
		}
		$object = get_field_object( $key, $id, false, false );
		return is_array( $object ) && ! empty( $object['key'] ) ? $object : null;
	}

	/**
	 * A label from a field name: 'event_date' becomes 'Event date'.
	 *
	 * @param string $key Field name.
	 */
	private static function label( string $key ): string {
		$words = trim( (string) preg_replace( '/[_\-]+/', ' ', $key ) );
		return '' === $words ? $key : ucfirst( strtolower( $words ) );
	}
}
