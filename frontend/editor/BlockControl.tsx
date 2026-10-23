import type * as ReactNS from 'react'
import { ShareIcon } from './icon'
import { ruleLabel } from './labels'
import { __, config, Fragment, h, sprintf, wp, type BlockUse } from './wp'

const { ToolbarGroup, ToolbarButton, Dropdown, SelectControl, ToggleControl } = wp.components
const { BlockControls } = wp.blockEditor

interface Social {
  use?: BlockUse
  first?: boolean
}

interface BlockEditProps {
  name: string
  clientId: string
  isSelected: boolean
  attributes: { sintSocial?: Social }
  setAttributes: (attrs: { sintSocial: Social }) => void
}

const USES: BlockUse[] = ['text', 'excerpt', 'media', 'link', 'skip', 'remove']

/** The "Social" control in the toolbar of the selected block. */
function SocialControl({ name, clientId, attributes, setAttributes }: BlockEditProps) {
  const social: Social = attributes.sintSocial ?? {}
  // As BlockParser decides it: the rule for the block type; else a block with blocks
  // inside passes the choice to them; else the default use.
  const inner = wp.data.useSelect((select) => select('core/block-editor').getBlockCount(clientId) as number, [clientId])
  const rule = config.blockRules[name] ?? (name === 'core/gallery' || inner > 0 ? '' : config.blockFallback)
  const ruleText = rule ? ruleLabel(rule) : __('the blocks inside use their own rules', 'social-integrations')
  const use = social.use ?? rule
  const changed = social.use !== undefined || !!social.first

  const save = (next: Social) => {
    const clean: Social = {}
    if (next.use) {
      clean.use = next.use
    }
    if (next.first) {
      clean.first = true
    }
    setAttributes({ sintSocial: clean })
  }

  return (
    <BlockControls group="other">
      <ToolbarGroup>
        <Dropdown
          popoverProps={{ placement: 'bottom-start' }}
          renderToggle={({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) => (
            <ToolbarButton icon={ShareIcon} label={__('Use in social posts', 'social-integrations')} onClick={onToggle} aria-expanded={isOpen} isPressed={changed}>
              {__('Social', 'social-integrations')}
            </ToolbarButton>
          )}
          renderContent={() => (
            <div className="sint-ed-block">
              <SelectControl
                __nextHasNoMarginBottom
                label={__('Use in social posts', 'social-integrations')}
                value={social.use ?? ''}
                options={[
                  { value: '', label: sprintf(__('Rule from Settings: %s', 'social-integrations'), ruleText) },
                  ...USES.map((u) => ({ value: u, label: ruleLabel(u) })),
                ]}
                onChange={(value: string) => save({ ...social, use: (value || undefined) as BlockUse | undefined })}
              />
              {use === 'media' && (
                <ToggleControl
                  __nextHasNoMarginBottom
                  label={__('Show this media first', 'social-integrations')}
                  checked={!!social.first}
                  onChange={(first: boolean) => save({ ...social, first })}
                />
              )}
              <p className="sint-ed-help">{__('This choice is for this block only. Settings have the rules for all blocks.', 'social-integrations')}</p>
            </div>
          )}
        />
      </ToolbarGroup>
    </BlockControls>
  )
}

/** Adds the sintSocial attribute to every block type and the control to the toolbar. */
export function registerBlockControl() {
  // The attribute must exist in the editor too, or the editor removes it when it saves.
  wp.hooks.addFilter('blocks.registerBlockType', 'social-integrations/attribute', (settings: { attributes?: Record<string, unknown> }) => ({
    ...settings,
    attributes: { ...settings.attributes, sintSocial: { type: 'object', default: {} } },
  }))

  if (!config.blockOverride) {
    return
  }
  const withControl = wp.compose.createHigherOrderComponent(
    (BlockEdit: ReactNS.ComponentType<BlockEditProps>) => (props: BlockEditProps) => (
      <Fragment>
        <BlockEdit {...props} />
        {props.isSelected && <SocialControl {...props} />}
      </Fragment>
    ),
    'withSocialIntegrationsControl',
  )
  wp.hooks.addFilter('editor.BlockEdit', 'social-integrations/block-control', withControl)
}
