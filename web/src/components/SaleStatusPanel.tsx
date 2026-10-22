import { useEffect, useRef, useState } from 'react'
import type { SaleState, SaleStatus } from '../types/sale'

const STATUS_LABELS: Record<SaleStatus, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  ended: 'Ended',
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const hms = [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
  return days > 0 ? `${days}d ${hms}` : hms
}

interface Props {
  sale: SaleState | undefined
  isError: boolean
  onCountdownEnd: () => void
}

export function SaleStatusPanel({ sale, isError, onCountdownEnd }: Props) {
  // Countdown runs on the browser clock from the startAt/endAt already received
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const target =
    sale?.status === 'upcoming' ? sale.startAt : sale?.status === 'active' ? sale.endAt : null
  const remainingMs = target === null ? null : Math.max(0, Date.parse(target) - now)

  // Refetch once per target when the countdown reaches zero
  const refetchedForRef = useRef<string | null>(null)
  useEffect(() => {
    const key = `${sale?.status}:${target}`
    if (remainingMs === 0 && refetchedForRef.current !== key) {
      refetchedForRef.current = key
      onCountdownEnd()
    }
  }, [sale?.status, target, remainingMs, onCountdownEnd])

  if (!sale) {
    return (
      <div className="sale-status">
        <p>{isError ? 'Unable to load the sale status' : 'Loading sale status...'}</p>
      </div>
    )
  }

  return (
    <div className="sale-status">
      <p>
        Status:{' '}
        <span className={`badge badge-${sale.status}`}>{STATUS_LABELS[sale.status]}</span>
      </p>
      <p>
        Remaining stock: <strong>{sale.stock}</strong> / {sale.totalStock}
      </p>
      {remainingMs !== null && (
        <p className="countdown">
          {sale.status === 'upcoming' ? 'Starts in' : 'Ends in'}{' '}
          <strong>{formatRemaining(remainingMs)}</strong>
        </p>
      )}
    </div>
  )
}
