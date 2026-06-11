import { useEffect, useRef, useState } from 'react'
import { Tv } from 'lucide-react'

const _cache = new Map<string, 'loading' | 'ok' | 'error'>()

interface Props {
  src: string | null | undefined
  alt: string
  className?: string
}

function proxyUrl(src: string): string {
  return `/api/iptv/logo-proxy?url=${encodeURIComponent(src)}`
}

export function LazyChannelImage({ src, alt, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const proxied = src ? proxyUrl(src) : null

  useEffect(() => {
    if (!proxied) {
      setStatus('error')
      return
    }

    const cached = _cache.get(proxied)
    if (cached === 'ok') { setStatus('ok'); return }
    if (cached === 'error') { setStatus('error'); return }

    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        observer.disconnect()

        if (_cache.get(proxied) === 'ok') { setStatus('ok'); return }
        if (_cache.get(proxied) === 'error') { setStatus('error'); return }

        _cache.set(proxied, 'loading')
        setStatus('loading')

        const img = new Image()
        img.onload = () => {
          _cache.set(proxied, 'ok')
          setStatus('ok')
        }
        img.onerror = () => {
          _cache.set(proxied, 'error')
          setStatus('error')
        }
        img.src = proxied
      },
      { rootMargin: '200px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [proxied])

  return (
    <div ref={ref} className={`flex-shrink-0 bg-slate-800 rounded overflow-hidden flex items-center justify-center ${className}`}>
      {status === 'ok' && proxied ? (
        <img src={proxied} alt={alt} className="w-full h-full object-contain" />
      ) : (
        <Tv className="w-5 h-5 text-slate-600" />
      )}
    </div>
  )
}
