<?php
/**
 * Plugin settings.
 *
 * @package SocialIntegrations
 */

namespace SocialIntegrations\Support;

use SocialIntegrations\Content\ShareBuilder;

defined( 'ABSPATH' ) || exit;

/**
 * Reads and writes the `sint_settings` option.
 */
final class Settings {

	const OPTION = 'sint_settings';

	/**
	 * Ways a block can be used in a social post. 'remove' is an old name of 'skip': posts
	 * can still have it in a block attribute, and settings read it as 'skip'.
	 */
	const BLOCK_USES = array( 'text', 'excerpt', 'media', 'link', 'skip', 'remove' );

	/**
	 * Days to keep share log rows. 0 keeps every row.
	 */
	const LOG_DAYS = array( 0, 30, 90, 180, 365 );

	/**
	 * Default settings.
	 */
	public static function defaults(): array {
		return array(
			'blocks'               => array(
				'core/paragraph' => 'excerpt',
				'core/heading'   => 'skip',
				'core/list'      => 'text',
				'core/image'     => 'media',
				'core/gallery'   => 'media',
				'core/video'     => 'media',
				'core/embed'     => 'link',
				'core/quote'     => 'skip',
				'core/pullquote' => 'skip',
				'core/shortcode' => 'skip',
				'core/code'      => 'skip',
				'core/html'      => 'skip',
			),
			'block_fallback'       => 'text',
			'allow_block_override' => true,
			'max_images'           => 4,
			'log_days'             => 0,
		);
	}

	/**
	 * All settings, merged over the defaults.
	 */
	public static function all(): array {
		$saved = get_option( self::OPTION, array() );
		$all   = self::merge( self::defaults(), is_array( $saved ) ? $saved : array() );
		// 'remove' and 'skip' do the same thing, so the settings show one of them.
		$all['blocks']         = array_map( array( self::class, 'block_use' ), (array) $all['blocks'] );
		$all['block_fallback'] = self::block_use( (string) $all['block_fallback'] );
		return $all;
	}

	/**
	 * A block use with the old name 'remove' changed to 'skip'.
	 *
	 * @param string $value Block use.
	 */
	public static function block_use( string $value ): string {
		return 'remove' === $value ? 'skip' : $value;
	}

	/**
	 * One setting.
	 *
	 * @param string $key     Top-level key.
	 * @param mixed  $fallback Value when the key is missing.
	 * @return mixed
	 */
	public static function get( string $key, $fallback = null ) {
		$all = self::all();
		return array_key_exists( $key, $all ) ? $all[ $key ] : $fallback;
	}

	/**
	 * Sanitizes and saves the settings the admin app sends.
	 *
	 * @param array $input Raw input.
	 * @return array The saved settings.
	 */
	public static function save( array $input ): array {
		$current = self::all();

		if ( isset( $input['blocks'] ) && is_array( $input['blocks'] ) ) {
			$blocks = array();
			foreach ( $input['blocks'] as $name => $use ) {
				$name = preg_replace( '/[^a-z0-9\-\/]/', '', strtolower( (string) $name ) );
				if ( $name && in_array( $use, self::BLOCK_USES, true ) ) {
					$blocks[ $name ] = self::block_use( $use );
				}
			}
			$current['blocks'] = $blocks;
		}

		if ( isset( $input['block_fallback'] ) && in_array( $input['block_fallback'], self::BLOCK_USES, true ) ) {
			$current['block_fallback'] = self::block_use( $input['block_fallback'] );
		}
		if ( isset( $input['allow_block_override'] ) ) {
			$current['allow_block_override'] = (bool) $input['allow_block_override'];
		}
		if ( isset( $input['max_images'] ) ) {
			$current['max_images'] = max( 1, min( 10, (int) $input['max_images'] ) );
		}
		if ( isset( $input['log_days'] ) && in_array( (int) $input['log_days'], self::LOG_DAYS, true ) ) {
			$current['log_days'] = (int) $input['log_days'];
		}

		update_option( self::OPTION, $current, false );
		return $current;
	}

	/**
	 * Caption templates for single networks. The plugin removes empty ones.
	 *
	 * @param array $input Network => template.
	 * @return array<string, string>
	 */
	public static function captions( array $input ): array {
		$captions = array();
		foreach ( $input as $network => $text ) {
			$network = sanitize_key( (string) $network );
			$text    = sanitize_textarea_field( is_string( $text ) ? $text : '' );
			if ( '' !== $network && '' !== trim( $text ) ) {
				$captions[ $network ] = $text;
			}
		}
		return $captions;
	}

	/**
	 * Selected images as media items. The plugin reads them again from the media library,
	 * so it keeps only real attachments.
	 *
	 * @param array $input Media items or attachment IDs.
	 */
	public static function media_items( array $input ): array {
		$items = array();
		foreach ( array_slice( $input, 0, 10 ) as $chosen ) {
			$item = ShareBuilder::attachment( (int) ( is_array( $chosen ) ? ( $chosen['id'] ?? 0 ) : $chosen ) );
			if ( $item ) {
				$items[] = $item;
			}
		}
		return $items;
	}

	/**
	 * Saved values over the defaults.
	 *
	 * @param array $defaults Defaults.
	 * @param array $saved    Saved values.
	 */
	private static function merge( array $defaults, array $saved ): array {
		foreach ( $saved as $key => $value ) {
			$defaults[ $key ] = $value;
		}
		return $defaults;
	}
}
