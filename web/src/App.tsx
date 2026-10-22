import { useEffect, useState } from 'react'

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }

function App() {
  const [health, setHealth] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json() as Promise<ApiResponse<unknown>>)
      .then((body) => {
        if (!body.success) throw new Error(`${body.error.code}: ${body.error.message}`)
        setHealth(body.data)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  return (
    <main>
      <h1>Health</h1>
      {error && <p>Request failed: {error}</p>}
      {!error && !health && <p>Loading...</p>}
      {health !== null && <pre>{JSON.stringify(health, null, 2)}</pre>}
    </main>
  )
}

export default App
