import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { TestHarness } from './TestHarness'

const isTestMode = window.location.search.includes('test')

createRoot(document.getElementById('root')!).render(<StrictMode>{isTestMode ? <TestHarness /> : <App />}</StrictMode>)
