import { Toolbar } from './components/Toolbar/Toolbar'
import { LeftPanel } from './components/LeftPanel/LeftPanel'
import { Canvas } from './components/Canvas/Canvas'
import { PromptBar } from './components/PromptBar/PromptBar'
import { RightPanel } from './components/RightPanel/RightPanel'
import { BatchPreviewOverlay } from './components/Canvas/BatchPreviewOverlay'
import { KeyboardShortcutsModal } from './components/Toolbar/KeyboardShortcutsModal'

function App() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--s0)',
        color: 'var(--t1)',
      }}
    >
      <Toolbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <LeftPanel />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          <Canvas />
          <PromptBar />
          <BatchPreviewOverlay />
          <KeyboardShortcutsModal />
        </div>
        <RightPanel />
      </div>
    </div>
  )
}

export default App

