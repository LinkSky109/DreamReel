import { useEffect, useState } from 'react'

type AuthVideoProps = {
  src?: string | null
  className?: string
}

/** 与 AuthImage 相同：受保护视频先带 token 拉取为 blob，再交给 video 播放。 */
export function AuthVideo({ src, className }: AuthVideoProps) {
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

  if (failed) return <div className="dr-media-fallback">视频需登录后查看</div>
  if (!objectUrl) return <div className="dr-media-loading" />
  return <video className={className} src={objectUrl} controls preload="metadata" />
}
