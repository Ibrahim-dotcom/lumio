import { motion } from 'framer-motion'
import { X, Keyboard, MousePointer, Eye, Undo, HelpCircle } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'

export function KeyboardShortcutsModal() {
  const showShortcuts = useEditorStore(s => s.showShortcuts)
  const setShowShortcuts = useEditorStore(s => s.setShowShortcuts)

  if (!showShortcuts) return null

  const categories = [
    {
      title: 'Tools',
      icon: <MousePointer size={14} />,
      items: [
        { keys: ['V'], desc: 'Select Tool' },
        { keys: ['C'], desc: 'Crop Tool' },
        { keys: ['B'], desc: 'Mask / Brush Tool' },
        { keys: ['H'], desc: 'Spot Healing Tool' },
        { keys: ['S'], desc: 'Clone Stamp Tool' },
        { keys: ['T'], desc: 'Add Text Tool' },
        { keys: ['R'], desc: 'Rectangle Shape Tool' },
        { keys: ['O'], desc: 'Circle Shape Tool' },
        { keys: ['I'], desc: 'Color Picker (Pick)' },
      ],
    },
    {
      title: 'Canvas & Navigation',
      icon: <Eye size={14} />,
      items: [
        { keys: ['Ctrl', 'V'], desc: 'Paste image from clipboard' },
        { keys: ['Space', 'Hold'], desc: 'Compare Before / After' },
        { keys: ['Space', 'Drag'], desc: 'Pan Canvas' },
        { keys: ['Ctrl', 'Wheel'], desc: 'Zoom Canvas' },
        { keys: ['+'], desc: 'Zoom In' },
        { keys: ['-'], desc: 'Zoom Out' },
        { keys: ['0'], desc: 'Fit to Screen' },
      ],
    },
    {
      title: 'History & Actions',
      icon: <Undo size={14} />,
      items: [
        { keys: ['Ctrl', 'Z'], desc: 'Undo last edit' },
        { keys: ['Ctrl', 'Shift', 'Z'], desc: 'Redo last edit' },
        { keys: ['?'], desc: 'Toggle keyboard shortcuts' },
      ],
    },
  ]

  return (
    <div
      onClick={() => setShowShortcuts(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(8, 8, 12, 0.75)',
        backdropFilter: 'blur(12px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 620,
          background: 'rgba(20, 20, 28, 0.85)',
          border: '1px solid var(--b2)',
          borderRadius: 'var(--r3)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--b1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Keyboard size={18} color="var(--a)" />
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--t1)' }}>
              Keyboard Shortcuts
            </span>
          </div>
          <button
            onClick={() => setShowShortcuts(false)}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--t3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background var(--fast), color var(--fast)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.color = 'var(--t1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.color = 'var(--t3)'
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '70vh', overflowY: 'auto' }}>
          {categories.map((cat, idx) => (
            <div key={idx}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: 'var(--t3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 10,
                }}
              >
                {cat.icon}
                {cat.title}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '8px 24px',
                }}
              >
                {cat.items.map((item, iIdx) => (
                  <div
                    key={iIdx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: 'var(--t2)' }}>{item.desc}</span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {item.keys.map((k, kIdx) => (
                        <kbd
                          key={kIdx}
                          style={{
                            background: 'var(--s3)',
                            border: '1px solid var(--b2)',
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: 10,
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            color: 'var(--t1)',
                            boxShadow: '0 1px 1px rgba(0,0,0,0.4)',
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--b1)',
            background: 'rgba(255, 255, 255, 0.01)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'var(--t3)',
          }}
        >
          <HelpCircle size={12} />
          Press <kbd style={{ background: 'var(--s3)', padding: '1px 4px', borderRadius: 3, border: '1px solid var(--b2)' }}>?</kbd> at any time to toggle this overlay.
        </div>
      </motion.div>
    </div>
  )
}
