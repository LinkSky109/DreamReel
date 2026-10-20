import { useEffect, useState } from 'react'

type AuthImageProps = {
  src?: string | null
  alt: string
  className?: string
}

/**
 * 受保护媒体需要带 token 请求；<img> 无法附加 Authorization，
 * 因此先 fetch 成 blob URL，再交给 img 渲染。
 */
export function AuthImage({ src, alt, className }: AuthImageProps) {
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

  if (failed) return <div className="dr-media-fallback">需登录查看</div>
  if (!objectUrl) return <div className="dr-media-loading" aria-label={alt} />
  return <img src={objectUrl} alt={alt} className={className} loading="lazy" />
}
