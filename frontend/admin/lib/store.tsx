import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import { config } from './config'
import type { Account, Network, PostType } from './types'

interface Store {
  networks: Network[]
  accounts: Account[]
  postTypes: PostType[]
  redirectUri: string
  loading: boolean
  network: (key: string) => Network | undefined
  reload: () => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

// The page gives the first data, so the app does not wait for three requests.
const boot = config.store
const booted = !!(boot?.networks && boot.accounts && boot['post-types'])

export function StoreProvider({ children }: { children: ReactNode }) {
  const [networks, setNetworks] = useState<Network[]>(boot?.networks?.networks ?? [])
  const [accounts, setAccounts] = useState<Account[]>(boot?.accounts ?? [])
  const [postTypes, setPostTypes] = useState<PostType[]>(boot?.['post-types'] ?? [])
  const [redirectUri, setRedirectUri] = useState(boot?.networks?.redirect_uri ?? '')
  const [loading, setLoading] = useState(!booted)

  const reload = useCallback(async () => {
    const [n, a, p] = await Promise.all([
      api.get<{ networks: Network[]; redirect_uri: string }>('networks'),
      api.get<Account[]>('accounts'),
      api.get<PostType[]>('post-types'),
    ])
    setNetworks(n.data.networks)
    setRedirectUri(n.data.redirect_uri)
    setAccounts(a.data)
    setPostTypes(p.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!booted) reload().catch(() => setLoading(false))
  }, [reload])

  const network = useCallback((key: string) => networks.find((n) => n.key === key), [networks])

  return (
    <StoreContext.Provider value={{ networks, accounts, postTypes, redirectUri, loading, network, reload }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore outside StoreProvider')
  return store
}

/* Hash routing: #/dashboard, #/calendar, #/accounts?connected=facebook */
export function useRoute(): { path: string; params: URLSearchParams; go: (to: string) => void } {
  const read = () => {
    const hash = window.location.hash.replace(/^#\/?/, '')
    const [path, qs] = hash.split('?')
    return { path: path || 'dashboard', params: new URLSearchParams(qs ?? '') }
  }
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onHash = () => setRoute(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = useCallback((to: string) => {
    window.location.hash = '#/' + to.replace(/^#?\/?/, '')
  }, [])
  return { ...route, go }
}
