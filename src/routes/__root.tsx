import type { ConvexQueryClient } from '@convex-dev/react-query'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { createServerFn } from '@tanstack/react-start'
import { getAuth } from '@workos/authkit-tanstack-react-start'
import type { ConvexReactClient } from 'convex/react'
import type { ReactElement, ReactNode } from 'react'

import Footer from '../components/Footer'
import Header from '../components/Header'
import { TooltipProvider } from '../components/ui/tooltip'
import ConvexProvider from '../integrations/convex/provider'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import WorkOSProvider from '../integrations/workos/provider'
import appCss from '../styles.css?url'
interface RouterContext {
  convexClient: ConvexReactClient
  convexQueryClient: ConvexQueryClient
  queryClient: QueryClient
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);root.style.colorScheme=resolved;}catch(e){}})();`

const fetchWorkosAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const auth = await getAuth()

  return {
    token: auth.user ? auth.accessToken : null,
    userId: auth.user?.id ?? null,
  }
})

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async (ctx) => {
    const { token, userId } = await fetchWorkosAuth()

    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token)
    }

    return { token, userId }
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'drawFlow',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

interface RootDocumentProps {
  children: ReactNode
}

function RootDocument({ children }: RootDocumentProps): ReactElement {
  const { queryClient } = useRouter().options.context
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isNewProposalDemo = pathname === '/demo/drawflow/new-proposal'

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="bg-background font-sans text-foreground antialiased [overflow-wrap:anywhere] selection:bg-primary/20">
        <WorkOSProvider>
          <ConvexProvider>
            <QueryClientProvider client={queryClient}>
              <TooltipProvider>
                <Header />
                {children}
                {!isNewProposalDemo && <Footer />}
                <TanStackDevtools
                  config={{
                    position: 'bottom-right',
                  }}
                  plugins={[
                    {
                      name: 'Tanstack Router',
                      render: <TanStackRouterDevtoolsPanel />,
                    },
                    TanStackQueryDevtools,
                  ]}
                />
              </TooltipProvider>
            </QueryClientProvider>
          </ConvexProvider>
        </WorkOSProvider>
        <Scripts />
      </body>
    </html>
  )
}
