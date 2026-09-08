'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'

export type Tab = { key: string; label: string; count?: number }

/**
 * Tabs de la app — única línea de diseño: fila con borde inferior, tab activo
 * con border-bottom coral de 2px y texto navy semibold. Para cambiar de sección
 * (no confundir con FilterChips, que son píldoras para filtrar listados).
 *
 * SE PARTEN EN VARIAS LÍNEAS, no se desplazan de lado. Antes era una fila con
 * overflow-x-auto: en un celular entraban dos o tres tabs y el resto quedaba
 * fuera de la pantalla, sin ninguna señal de que estuvieran ahí. Había que
 * adivinar que se arrastraba. Reportado en el perfil de miembro, que llega a
 * siete tabs — o sea cuatro invisibles.
 *
 * Envolver en vez de desplazar no necesita flechas, ni degradados, ni detectar
 * el ancho: en pantalla ancha no se parte nada y se ve igual que antes, y en
 * una angosta se ven todos de una. La única contra es que la barra crece de
 * alto, y por eso quien la use pegada arriba tiene que mirar cómo le queda.
 */
export function Tabs({
  tabs, active, onChange, className,
}: {
  tabs: Tab[]
  active: string
  onChange: (key: string) => void
  className?: string
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Navegación por teclado del patrón tablist: ←/→ mueven y activan; Home/End a los extremos.
  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = idx
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else return
    e.preventDefault()
    onChange(tabs[next].key)
    btnRefs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      className={cn(
        'flex flex-wrap border-b border-outline',
        className,
      )}
    >
      {tabs.map((t, idx) => {
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            ref={el => { btnRefs.current[idx] = el }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={e => onKeyDown(e, idx)}
            onClick={() => onChange(t.key)}
            className={cn(
              'shrink-0 px-4 py-2.5 text-sm font-body border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-coral text-navy font-semibold'
                : 'border-transparent text-navy-light/80 hover:text-navy',
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={cn('ml-1', isActive && 'text-coral')}>({t.count})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
