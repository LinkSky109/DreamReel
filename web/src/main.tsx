import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { TooltipProvider } from '@radix-ui/react-tooltip'
import { Toaster } from 'sonner'
import { App } from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
import { LangProvider } from './lib/i18n'
import { ThemeProvider, useTheme } from './lib/theme'
import './styles/app.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
})

function ThemedToaster() {
  const { theme } = useTheme()
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{ duration: 2800 }}
    />
  )
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root not found')

createRoot(rootElement).render(
  // 不使用 StrictMode：legacy 桥接视图会在双次 effect 中重复挂载监听器
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ThemeProvider>
          <LangProvider>
            <TooltipProvider delayDuration={300}>
              <App />
              <ThemedToaster />
            </TooltipProvider>
          </LangProvider>
        </ThemeProvider>
      </HashRouter>
    </QueryClientProvider>
  </ErrorBoundary>
)
