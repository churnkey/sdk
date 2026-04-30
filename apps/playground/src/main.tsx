import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { RecipeBrowser } from './RecipeBrowser'
import { TestHarness } from './TestHarness'

const params = new URLSearchParams(window.location.search)
const route = params.has('recipes') ? 'recipes' : params.has('test') ? 'test' : 'app'

const Page = route === 'recipes' ? RecipeBrowser : route === 'test' ? TestHarness : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
