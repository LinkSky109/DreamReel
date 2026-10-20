import { useEffect, useState } from 'react'

type AuthAudioProps = {
  src?: string | null
  className?: string
}

/** 受保护音频：带 token 拉取为 blob 后播放。 */
export function AuthAudio({ src, className }: AuthAudioProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let created: string | null = null
    setObjectUrl(null)
    setFailed(false)
    if (!src) return () => undefined

    const target = new URL(src, window.location.origin)
    const headers: Record<string, string> = {}
    const token = localStorage.getItem('dreamreel_token')
    if (token && target.origin === window.location.origin) headers.Authorization = `Bearer ${token}`

    fetch(target.toString(), { headers })
      .then((response) => {
        if (!response.ok) throw new Error(`media ${response.status}`)
        return response.blob()
      })
      .then((blob) => {
        if (!active) return
        created = URL.createObjectURL(blob)
        setObjectUrl(created)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [src])

  if (failed) return <span className="dr-audio-fallback">试听需登录</span>
  if (!objectUrl) return <span className="dr-audio-fallback">载入中…</span>
  return <audio className={className} src={objectUrl} controls autoPlay />
}
