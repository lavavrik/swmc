import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from './ui/AppShell'
import './ui/theme.css'

const container = document.getElementById('root')
if (!container) throw new Error('missing #root')

createRoot(container).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
)
