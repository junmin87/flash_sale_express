import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { ApiError } from '../lib/api'
import { useCheckPurchase, usePurchase } from '../lib/usePurchase'
import type { SaleState, SaleStatus } from '../types/sale'

interface FormValues {
  userId: string
}

interface ResultMessage {
  tone: 'success' | 'error' | 'info'
  text: string
}

// Same rule as the server: 1-64 characters after trimming
const USER_ID_MAX_LENGTH = 64

function getDisabledReason(sale: SaleState | undefined): string | null {
  if (!sale) return 'Sale status is not available'
  if (sale.status === 'upcoming') return 'The sale has not started yet'
  if (sale.status === 'ended') return 'The sale has ended'
  if (sale.stock <= 0) return 'Sold out'
  return null
}

function errorMessage(error: unknown, status: SaleStatus | undefined): string {
  if (!(error instanceof ApiError)) return 'Something went wrong'
  switch (error.code) {
    case 'ALREADY_PURCHASED':
      return 'You have already purchased this item'
    case 'SALE_NOT_ACTIVE':
      return status === 'ended' ? 'The sale has ended' : 'The sale has not started yet'
    case 'SOLD_OUT':
      return 'Sold out'
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

export function PurchasePanel({ sale }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { userId: '' } })
  const purchase = usePurchase()
  const checkPurchase = useCheckPurchase()
  const [buyResult, setBuyResult] = useState<ResultMessage | null>(null)
  const [checkResult, setCheckResult] = useState<ResultMessage | null>(null)

  // Refs block repeated clicks/Enter that arrive before isPending re-renders the button
  const buyingRef = useRef(false)
  const checkingRef = useRef(false)

  const disabledReason = getDisabledReason(sale)
  const buyDisabled = disabledReason !== null || purchase.isPending

  const onBuy = async ({ userId }: FormValues) => {
    if (buyingRef.current || disabledReason !== null) return
    buyingRef.current = true
    setBuyResult(null)
    try {
      await purchase.mutateAsync(userId.trim())
      setBuyResult({ tone: 'success', text: 'Purchase successful!' })
    } catch (error) {
      setBuyResult({ tone: 'error', text: errorMessage(error, sale?.status) })
    } finally {
      buyingRef.current = false
    }
  }

  const onCheck = async ({ userId }: FormValues) => {
    if (checkingRef.current) return
    checkingRef.current = true
    setCheckResult(null)
    try {
      const { purchased } = await checkPurchase.mutateAsync(userId.trim())
      setCheckResult(
        purchased
          ? { tone: 'success', text: 'You have purchased this item' }
          : { tone: 'info', text: 'No purchase found' },
      )
    } catch (error) {
      setCheckResult({ tone: 'error', text: errorMessage(error, sale?.status) })
    } finally {
      checkingRef.current = false
    }
  }

  return (
    <form className="purchase-form" onSubmit={(event) => void handleSubmit(onBuy)(event)} noValidate>
      <label htmlFor="userId">User ID</label>
      <input
        id="userId"
        type="text"
        autoComplete="off"
        placeholder="e.g. user1"
        aria-invalid={errors.userId ? true : undefined}
        {...register('userId', {
          validate: (value) => {
            const length = value.trim().length
            if (length === 0) return 'User ID is required'
            if (length > USER_ID_MAX_LENGTH) {
              return `User ID must be at most ${USER_ID_MAX_LENGTH} characters`
            }
            return true
          },
        })}
      />
      {errors.userId && <p className="field-error">{errors.userId.message}</p>}

      <div className="button-row">
        <button type="submit" className="primary" disabled={buyDisabled}>
          {purchase.isPending ? 'Processing...' : 'Buy Now'}
        </button>
        {disabledReason && <span className="disabled-reason">{disabledReason}</span>}
      </div>
      {buyResult && (
        <p className={`message ${buyResult.tone}`} role="status">
          {buyResult.text}
        </p>
      )}

      <div className="button-row">
        <button type="button" onClick={(event) => void handleSubmit(onCheck)(event)} disabled={checkPurchase.isPending}>
          {checkPurchase.isPending ? 'Processing...' : 'Check my order'}
        </button>
      </div>
      {checkResult && (
        <p className={`message ${checkResult.tone}`} role="status">
          {checkResult.text}
        </p>
      )}
    </form>
  )
}
