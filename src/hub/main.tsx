import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { StrategyHub } from './StrategyHub'

createRoot(document.getElementById('root')!).render(<StrictMode><StrategyHub /></StrictMode>)
