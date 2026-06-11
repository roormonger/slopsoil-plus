import { useEffect, useRef, useState } from 'react'
import { Tv } from 'lucide-react'

const _cache = new Map<string, 'loading' | 'ok' | 'error'>()

interface Props {
  src: string | null | undefined
  alt: string
  className?: string
}

export function LazyChannelImage({ src, alt, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  useEffect(() => {
    if (!src) {
      setStatus('error')
      return
    }

    const cached = _cache.get(src)
    if (cached === 'ok') { setStatus('ok'); return }
    if (cached === 'error') { setStatus('error'); return }

    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        observer.disconnect()

        if (_cache.get(src) === 'ok') { setStatus('ok'); return }
        if (_cache.get(src) === 'error') { setStatus('error'); return }

        _cache.set(src, 'loading')
        setStatus('loading')

        const img = new Image()
        img.onload = () => {
          _cache.set(src, 'ok')
          setStatus('ok')
        }
        img.onerror = () => {
          _cache.set(src, 'error')
          setStatus('error')
        }
        img.src = src
      },
      { rootMargin: '200px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [src])

  return (
    <div ref={ref} className={`flex-shrink-0 bg-slate-800 rounded overflow-hidden flex items-center justify-center ${className}`}>
      {status === 'ok' && src ? (
        <img src={src} alt={alt} className="w-full h-full object-contain" loading="lazy" />
      ) : (
        <Tv className="w-5 h-5 text-slate-600" />
      )}
    </div>
  )
}
