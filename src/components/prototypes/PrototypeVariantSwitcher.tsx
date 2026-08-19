import { ArrowLeft, ArrowRight, FlaskConical } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '../ui/button'

interface PrototypeVariant {
  key: string
  label: string
}

interface PrototypeVariantSwitcherProps {
  current: string
  onChange: (variant: string) => void
  variants: readonly PrototypeVariant[]
}

export function PrototypeVariantSwitcher({
  current,
  onChange,
  variants,
}: PrototypeVariantSwitcherProps) {
  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  )

  const cycle = (direction: -1 | 1) => {
    const nextIndex =
      (currentIndex + direction + variants.length) % variants.length
    const nextVariant = variants[nextIndex]

    if (nextVariant) {
      onChange(nextVariant.key)
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.matches('input, textarea, [contenteditable="true"]') ||
          target.closest('input, textarea, [contenteditable="true"]'))
      ) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        cycle(-1)
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        cycle(1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, variants])

  if (import.meta.env.PROD) {
    return null
  }

  const selected = variants[currentIndex]

  return (
    <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-foreground/15 bg-foreground px-2 py-2 text-background shadow-2xl shadow-black/25">
      <Button
        aria-label="Show previous prototype variant"
        className="rounded-full text-background hover:bg-background/15 hover:text-background"
        onClick={() => cycle(-1)}
        size="icon-sm"
        variant="ghost"
      >
        <ArrowLeft />
      </Button>
      <div className="flex min-w-48 items-center justify-center gap-2 px-2 text-center text-xs font-medium">
        <FlaskConical className="size-3.5 text-primary" />
        <span>
          {selected?.key} — {selected?.label}
        </span>
      </div>
      <Button
        aria-label="Show next prototype variant"
        className="rounded-full text-background hover:bg-background/15 hover:text-background"
        onClick={() => cycle(1)}
        size="icon-sm"
        variant="ghost"
      >
        <ArrowRight />
      </Button>
    </div>
  )
}
