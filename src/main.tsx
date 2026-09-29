import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SessionProvider } from './session/SessionContext'
import { PlayerProvider } from './playback/PlayerContext'
import { registerStreaming } from './playback/streaming'
import { App } from './App'

// landing.css first: it owns the design tokens — the palette ported from
// ui/theme/Color.kt, the two-typeface rule, the base reset — and app.css
// builds the client's own screens on top of them.
import './styles/landing.css'
import './styles/app.css'

// The worker that puts the sign-in header on media requests. Registered
// before the first render so it is usually in control by the time anybody
// reaches a player.
registerStreaming()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        {/* Above the routes, so a track outlives the page it was started on. */}
        <PlayerProvider>
          <App />
        </PlayerProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
)
