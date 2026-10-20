import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { AiMessage } from '../../domain/types'
import { Icon } from '../../components/Icon'

type Props = {
  projectId: string
}

export function AiAssistantPanel({ projectId }: Props) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<AiMessage[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  const quickQuery = useQuery({
    queryKey: ['ai', 'quick-actions'],
    queryFn: () => api.getAiQuickActions(),
    enabled: open,
    staleTime: 300_000,
  })
  const conversationQuery = useQuery({
    queryKey: ['ai', 'conversation', projectId],
    queryFn: () => api.getAiConversation(projectId),
    enabled: open,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (conversationQuery.data) {
      setMessages(conversationQuery.data.conversation ?? [])
    }
  }, [conversationQuery.data])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
    }, 50)
    return () => window.clearTimeout(timer)
  }, [messages, open])

  const sendMutation = useMutation({
    mutationFn: async (payload: { text: string; actionId?: string }) => {
      if (payload.actionId) return api.runAiQuickAction(projectId, payload.actionId)
      return api.sendAiMessage(projectId, payload.text)
    },
    onMutate: (payload) => {
      setMessages((current) => [
        ...current,
        { role: 'user', content: payload.text, timestamp: new Date().toISOString() },
      ])
    },
    onSuccess: (reply) => {
      setMessages((current) => [...current, reply])
    },
    onError: (error: Error) => {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: `${t('请求失败', 'Request failed')}：${error.message}` },
      ])
      showToast(error.message, 'error')
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => api.clearAiConversation(projectId),
    onSuccess: () => {
      setMessages([])
      showToast(t('对话已清空', 'Conversation cleared'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const send = () => {
    const text = input.trim()
    if (!text || sendMutation.isPending) return
    setInput('')
    sendMutation.mutate({ text })
  }

  const actions = quickQuery.data?.actions ?? []
  const cleanLabel = (label: string) => label.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').trim()

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="ed-ai-fab"
          aria-label={t('AI 创作助手', 'AI assistant')}
          onClick={() => setOpen(true)}
        >
          <Icon name="sparkles" size={20} />
        </button>
      ) : null}

      {open ? (
        <aside className="ed-ai-panel" role="dialog" aria-label={t('AI 创作助手', 'AI assistant')}>
          <header className="ed-ai-head">
            <div className="ed-ai-title">
              <span className="ed-ai-mark">
                <Icon name="sparkles" size={15} />
              </span>
              {t('AI 创作助手', 'AI assistant')}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className="dr-icon-btn"
                aria-label={t('清空对话', 'Clear conversation')}
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
              >
                <Icon name="trash" size={15} />
              </button>
              <button
                type="button"
                className="dr-icon-btn"
                aria-label={t('关闭', 'Close')}
                onClick={() => setOpen(false)}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </header>

          <div className="ed-ai-messages" ref={listRef}>
            {conversationQuery.isLoading ? (
              <div className="dr-hint" style={{ padding: 12 }}>{t('加载对话…', 'Loading…')}</div>
            ) : messages.length === 0 ? (
              <div className="ed-ai-empty">
                <Icon name="sparkles" size={22} />
                <strong>{t('从快捷问题开始', 'Start with a quick prompt')}</strong>
                <span>
                  {t(
                    '我会结合当前剧本、角色与镜头给出具体建议。',
                    'I use your script, characters, and shots as context.'
                  )}
                </span>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  className={`ed-ai-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
                  key={`${message.timestamp ?? ''}-${index}`}
                >
                  {message.content}
                </div>
              ))
            )}
            {sendMutation.isPending ? (
              <div className="ed-ai-message is-assistant is-typing">
                <span className="loading" />
                {t('思考中…', 'Thinking…')}
              </div>
            ) : null}
          </div>

          <div className="ed-ai-quick">
            {actions.slice(0, 4).map((action) => (
              <button
                key={action.id}
                type="button"
                className="dr-chip"
                disabled={sendMutation.isPending}
                onClick={() => sendMutation.mutate({ text: cleanLabel(action.label), actionId: action.id })}
              >
                {cleanLabel(action.label)}
              </button>
            ))}
          </div>

          <div className="ed-ai-input">
            <textarea
              className="dr-input"
              rows={2}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
              placeholder={t('问点什么，Enter 发送，Shift+Enter 换行…', 'Ask anything. Enter to send.')}
              aria-label={t('给 AI 助手的消息', 'Message to AI assistant')}
            />
            <button
              type="button"
              className="dr-btn dr-btn-primary"
              disabled={sendMutation.isPending || !input.trim()}
              onClick={send}
            >
              {t('发送', 'Send')}
            </button>
          </div>
        </aside>
      ) : null}
    </>
  )
}
