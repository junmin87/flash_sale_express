import { DemoControls } from './components/DemoControls'
import { PurchasePanel } from './components/PurchasePanel'
import { SaleStatusPanel } from './components/SaleStatusPanel'
import { useSale } from './lib/useSale'

function App() {
  const sale = useSale()

  return (
    <main className="page">
      <h1>Flash Sale</h1>
      <div className="layout">
        <section className="panel purchase-area">
          <SaleStatusPanel
            sale={sale.data}
            isError={sale.isError}
            onCountdownEnd={() => void sale.refetch()}
          />
          {/* Remount when the sale settings change, so old results are cleared */}
          <PurchasePanel key={`${sale.data?.startAt}|${sale.data?.endAt}|${sale.data?.totalStock}`} sale={sale.data} />
        </section>
        <DemoControls sale={sale.data} />
      </div>
    </main>
  )
}

export default App
