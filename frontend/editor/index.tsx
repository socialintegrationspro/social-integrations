// The block editor bundle: the Social Integrations sidebar and the "Social" control in
// the block toolbar. backend/Editor/SidebarPanel.php loads it.
import './editor.css'
import { registerBlockControl } from './BlockControl'
import { ShareIcon } from './icon'
import { SidebarContent } from './Sidebar'
import { __, Fragment, h, PluginSidebar, PluginSidebarMoreMenuItem, wp } from './wp'

const NAME = 'social-integrations'

registerBlockControl()

if (PluginSidebar) {
  wp.plugins.registerPlugin(NAME, {
    icon: ShareIcon,
    render: () => (
      <Fragment>
        {PluginSidebarMoreMenuItem && <PluginSidebarMoreMenuItem target="sidebar">{__('Social Integrations', 'social-integrations')}</PluginSidebarMoreMenuItem>}
        <PluginSidebar name="sidebar" title={__('Social Integrations', 'social-integrations')} icon={ShareIcon}>
          <SidebarContent />
        </PluginSidebar>
      </Fragment>
    ),
  })
}
