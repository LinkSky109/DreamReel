import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { NAV_GROUPS, type NavItem } from '../app/nav'

export type Lang = 'zh' | 'en'

type LangContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  toggleLang: () => void
  t: (zh: string, en: string) => string
  navLabel: (item: NavItem) => string
  navGroupTitle: (title: string) => string
}

const LANG_KEY = 'dreamreel_lang'

const LangContext = createContext<LangContextValue | null>(null)

const GROUP_EN: Record<string, string> = {
  创作: 'Create',
  创作工具: 'Tools',
  商业与团队: 'Business',
  发现与账户: 'Discover',
}

function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // ignore
    }
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'
  }, [lang])

  const setLang = useCallback((next: Lang) => setLangState(next), [])
  const toggleLang = useCallback(() => setLangState((current) => (current === 'zh' ? 'en' : 'zh')), [])

  const t = useCallback((zh: string, en: string) => (lang === 'en' ? en : zh), [lang])
  const navLabel = useCallback((item: NavItem) => (lang === 'en' ? item.labelEn : item.label), [lang])
  const navGroupTitle = useCallback(
    (title: string) => (lang === 'en' ? GROUP_EN[title] ?? title : title),
    [lang]
  )

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t, navLabel, navGroupTitle }),
    [lang, setLang, toggleLang, t, navLabel, navGroupTitle]
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangContextValue {
  const context = useContext(LangContext)
  if (!context) throw new Error('useLang must be used inside LangProvider')
  return context
}

export { NAV_GROUPS }
