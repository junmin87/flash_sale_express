import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setSale } from './api'
import { SALE_QUERY_KEY } from './useSale'

export function useAdminSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setSale,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SALE_QUERY_KEY })
    },
  })
}
