import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { ApiError } from '../lib/api'
import { useAdminSale } from '../lib/useAdminSale'
import type { SaleState } from '../types/sale'

interface FormValues {
  startAt: string
  endAt: string
  stock: number
}

interface ResultMessage {
  tone: 'success' | 'error'
  text: string
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

// ISO string -> "YYYY-MM-DDTHH:mm" in local time, the datetime-local format
function toLocalInput(iso: string): string {
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * MINUTE_MS)
    .toISOString()
    .slice(0, 16)
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong'
  switch (error.code) {
    case 'NOT_FOUND':
      return 'Admin API is disabled'
    case 'VALIDATION_ERROR':
      return error.message
    case 'SERVICE_UNAVAILABLE':
      return 'Service is busy, please try again'
    default:
      return 'Something went wrong'
  }
}

interface Props {
  sale: SaleState | undefined
}

export function DemoControls({ sale }: Props) {
  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { startAt: '', endAt: '', stock: 0 } })
  const adminSale = useAdminSale()
  const [result, setResult] = useState<ResultMessage | null>(null)

  // One guard for all four buttons, since they call the same API
  const applyingRef = useRef(false)

  // Refill the form whenever the sale settings change; polling with the same values does not reset input
  const startAt = sale?.startAt
  const endAt = sale?.endAt
  const totalStock = sale?.totalStock
  useEffect(() => {
    if (startAt === undefined || endAt === undefined || totalStock === undefined) return
    reset({
      startAt: toLocalInput(startAt),
      endAt: toLocalInput(endAt),
      stock: totalStock,
    })
  }, [startAt, endAt, totalStock, reset])

  const send = async (startAt: Date, endAt: Date, stock: number) => {
    setResult(null)
    try {
      await adminSale.mutateAsync({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        stock,
      })
      setResult({ tone: 'success', text: 'Sale settings applied' })
    } catch (error) {
      setResult({ tone: 'error', text: errorMessage(error) })
    }
  }

  const onApply = async (values: FormValues) => {
    if (applyingRef.current) return
    applyingRef.current = true
    try {
      // datetime-local values are parsed as local time
      await send(new Date(values.startAt), new Date(values.endAt), values.stock)
    } finally {
      applyingRef.current = false
    }
  }

  // Quick presets use the stock input and times relative to now
  const applyPreset = async (startOffsetMs: number, endOffsetMs: number) => {
    if (applyingRef.current) return
    applyingRef.current = true
    try {
      if (!(await trigger('stock'))) return
      const now = Date.now()
      await send(new Date(now + startOffsetMs), new Date(now + endOffsetMs), getValues('stock'))
    } finally {
      applyingRef.current = false
    }
  }

  const pending = adminSale.isPending

  return (
    <details className="panel demo-controls">
      <summary>Admin · Demo controls (not part of the user flow)</summary>
      <p className="hint">For reviewers: configure or reset the sale window and stock.</p>
      <form onSubmit={(event) => void handleSubmit(onApply)(event)} noValidate>
        <label htmlFor="startAt">Start at</label>
        <input
          id="startAt"
          type="datetime-local"
          aria-invalid={errors.startAt ? true : undefined}
          {...register('startAt', { required: 'Start time is required' })}
        />
        {errors.startAt && <p className="field-error">{errors.startAt.message}</p>}

        <label htmlFor="endAt">End at</label>
        <input
          id="endAt"
          type="datetime-local"
          aria-invalid={errors.endAt ? true : undefined}
          {...register('endAt', { required: 'End time is required' })}
        />
        {errors.endAt && <p className="field-error">{errors.endAt.message}</p>}

        <label htmlFor="stock">Stock</label>
        <input
          id="stock"
          type="number"
          min={0}
          step={1}
          aria-invalid={errors.stock ? true : undefined}
          {...register('stock', {
            valueAsNumber: true,
            validate: (value) =>
              (Number.isInteger(value) && value >= 0) || 'Stock must be an integer of 0 or more',
          })}
        />
        {errors.stock && <p className="field-error">{errors.stock.message}</p>}

        <button type="submit" className="primary" disabled={pending}>
          {pending ? 'Processing...' : 'Apply & Reset'}
        </button>

        <div className="preset-row">
          <button type="button" disabled={pending} onClick={() => applyPreset(0, HOUR_MS)}>
            Start now
          </button>
          <button type="button" disabled={pending} onClick={() => applyPreset(MINUTE_MS, HOUR_MS)}>
            Upcoming (+1 min)
          </button>
          <button type="button" disabled={pending} onClick={() => applyPreset(-HOUR_MS, 0)}>
            End now
          </button>
        </div>
        <ul className="hint">
          <li>Start now: sale is active now, ends in 1 hour</li>
          <li>Upcoming (+1 min): sale starts in 1 minute</li>
          <li>End now: sale has ended</li>
          <li>All buttons reset purchases and use the stock above.</li>
        </ul>

        {result && (
          <p className={`message ${result.tone}`} role="status">
            {result.text}
          </p>
        )}
      </form>
    </details>
  )
}
