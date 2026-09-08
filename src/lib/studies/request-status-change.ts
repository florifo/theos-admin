/**
 * Cambiar el estado de una solicitud a mano.
 *
 * POR QUÉ EXISTE. Una solicitud de interés nacía 'open' y no había cómo
 * moverla: la cola se llenaba de pedidos viejos que nadie podía cerrar. Las
 * acciones que había —tomar, asignar, resolver, rechazar— cubren el flujo
 * normal, pero no el "esto ya no aplica" ni el "se venció y hay que reabrirla".
 *
 * QUIÉN. Solo coordinación de estudios, de dirigentes, dirección y admin
 * (decisión 2026-09-08). El comité sigue con lo suyo: trabaja lo que le
 * asignaron con las acciones de siempre.
 */
import type { StudyRequestStatus } from '@/types/study'

/** Desde dónde se puede mover a mano.
 *
 *  'resolved' NO está: una reubicación resuelta YA matriculó a alguien y le
 *  transfirió la inscripción anterior. Devolverla a abierta dejaría la pantalla
 *  diciendo una cosa y los datos otra. Para deshacer eso hay que tocar la
 *  matrícula, no el estado de la solicitud. */
export const ESTADOS_MOVIBLES: readonly StudyRequestStatus[] = [
  'open', 'in_review', 'rejected', 'vencida',
]

/** Hacia dónde. 'resolved' se ofrece SOLO en las de interés: ahí resolver es
 *  nada más un cambio de estado. En una reubicación, resolver significa
 *  matricular a la persona en el grupo destino, y eso tiene que pasar por el
 *  flujo que lo hace de verdad — marcarla resuelta a mano sería mentir. */
export function estadosDestino(requestType: string): StudyRequestStatus[] {
  const base: StudyRequestStatus[] = ['open', 'in_review', 'rejected', 'vencida']
  return requestType === 'study_interest' ? [...base, 'resolved'] : base
}

export type CambioDeEstado = {
  requestType: string
  from: string
  to: string
}

/** null = se puede. Si no, el motivo, en el mismo texto que ve quien lo intenta. */
export function motivoQueImpide(cambio: CambioDeEstado): string | null {
  if (cambio.from === cambio.to) return 'La solicitud ya está en ese estado.'
  if (!(ESTADOS_MOVIBLES as readonly string[]).includes(cambio.from)) {
    return 'Una solicitud resuelta no se puede mover: la resolución ya matriculó a la persona.'
  }
  if (!(estadosDestino(cambio.requestType) as string[]).includes(cambio.to)) {
    return cambio.to === 'resolved'
      ? 'Una reubicación se resuelve eligiendo el grupo destino, no cambiando el estado.'
      : 'Ese estado no existe para esta solicitud.'
  }
  return null
}

export function puedeCambiarEstado(cambio: CambioDeEstado): boolean {
  return motivoQueImpide(cambio) === null
}
