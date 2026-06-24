import React, { useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEditorStore } from '../../store/editorStore'
import { Eye, EyeOff, Lock, Unlock, Clock, Info, Layers, ImageIcon, Zap, LayoutList } from 'lucide-react'
import { useUpload } from '../../hooks/useUpload'
import { WorkflowsTab } from './WorkflowsTab'
import { BatchPanel } from './BatchPanel'

type LeftTab = 'hist' | 'layers' | 'wf' | 'batch' | 'info'

export function LeftPanel() {
  const [activeTab, setActiveTab] = useState<LeftTab>('hist')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const imageEl = useEditorStore(s => s.imageEl)
  const imageName = useEditorStore(s => s.imageName)
  const imageSize = useEditorStore(s => s.imageSize)
  const showToast = useEditorStore(s => s.showToast)
  const pushHistory = useEditorStore(s => s.pushHistory)
  const history = useEditorStore(s => s.history)
  const historyIndex = useEditorStore(s => s.historyIndex)
  const jumpToHistory = useEditorStore(s => s.jumpToHistory)
  const layers = useEditorStore(s => s.layers)
  const toggleLayerVisibility = useEditorStore(s => s.toggleLayerVisibility)
  const toggleLayerLock = useEditorStore(s => s.toggleLayerLock)
  const editCount = useEditorStore(s => s.editCount)

  const { upload, isUploading, progress } = useUpload()

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', true)
      return
    }
    upload(file).then(() => {
      pushHistory('Original')
      showToast('Photo loaded & synced with server — describe an edit below ✦')
    }).catch(() => {
      showToast('Backend upload failed, loaded locally', true)
      pushHistory('Original')
    })
  }, [upload, pushHistory, showToast])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) loadFile(f)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() { setIsDragging(false) }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) loadFile(f)
  }

  function fmtSz(b: number) {
    if (b < 1024) return b + 'B'
    if (b < 1048576) return (b / 1024).toFixed(1) + 'KB'
    return (b / 1048576).toFixed(1) + 'MB'
  }

  function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a }
  function aspectRatio(w: number, h: number) { const g = gcd(w, h); return `${w/g}:${h/g}` }

  const TABS = [
    { id: 'hist' as LeftTab, label: 'History', icon: <Clock size={11} /> },
    { id: 'layers' as LeftTab, label: 'Layers', icon: <Layers size={11} /> },
    { id: 'wf' as LeftTab, label: 'Workflows', icon: <Zap size={11} /> },
    { id: 'batch' as LeftTab, label: 'Batch', icon: <LayoutList size={11} /> },
    { id: 'info' as LeftTab, label: 'Info', icon: <Info size={11} /> },
  ]

  return (
    <aside style={{
      width: 'var(--lw)', background: 'var(--s1)',
      borderRight: '1px solid var(--b1)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Upload zone */}
      <div style={{ padding: 13, borderBottom: '1px solid var(--b1)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 9 }}>
          Photo
        </div>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !imageEl && fileInputRef.current?.click()}
          style={{
            border: `1.5px dashed ${isDragging ? 'var(--a)' : 'var(--b2)'}`,
            borderRadius: 'var(--r2)',
            cursor: imageEl ? 'default' : 'pointer',
            background: isDragging ? 'var(--ag2)' : 'var(--s2)',
            overflow: 'hidden', position: 'relative',
            transition: 'border-color var(--fast), background var(--fast)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', zIndex: 1 }}
          />

          {isUploading ? (
            <div style={{ padding: '24px 12px', textAlign: 'center' }}>
              <div style={{
                width: 24, height: 24, border: '2px solid var(--b3)', borderTopColor: 'var(--a)',
                borderRadius: '50%', margin: '0 auto 10px',
                animation: 'spin 0.8s linear infinite'
              }} />
              <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
              `}</style>
              <p style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>
                Uploading to server...
              </p>
              <div style={{
                height: 3, width: '60%', background: 'var(--b3)', borderRadius: 2,
                margin: '8px auto 0', overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%', width: `${progress}%`, background: 'var(--a)',
                  transition: 'width var(--fast)'
                }} />
              </div>
            </div>
          ) : imageEl ? (
            <>
              <img
                src={imageEl.src}
                crossOrigin="anonymous"
                alt={imageName}
                style={{ width: '100%', height: 88, objectFit: 'cover', display: 'block' }}
              />
              <button
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
                style={{
                  position: 'absolute', bottom: 6, right: 6,
                  background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 6,
                  color: '#fff', fontSize: 10, padding: '3px 8px', cursor: 'pointer',
                  zIndex: 2,
                }}
              >
                Change photo
              </button>
            </>
          ) : (
            <div style={{ padding: '16px 12px', textAlign: 'center' }}>
              <ImageIcon size={26} color="var(--t3)" style={{ marginBottom: 5 }} />
              <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.65 }}>
                <strong style={{ color: 'var(--t1)', fontWeight: 500 }}>Drop photo here</strong><br />
                or click to browse
              </p>
              <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>
                JPEG · PNG · WebP · HEIC
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '8px 10px', borderBottom: '1px solid var(--b1)', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, height: 27, background: activeTab === tab.id ? 'var(--s3)' : 'transparent',
              border: `1px solid ${activeTab === tab.id ? 'var(--b2)' : 'transparent'}`,
              borderRadius: 'var(--r)', font: `500 11px var(--body)`,
              color: activeTab === tab.id ? 'var(--t1)' : 'var(--t3)',
              cursor: 'pointer', transition: 'all var(--fast)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'hist' && (
            <motion.div
              key="hist"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              {history.length <= 1 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 12px', textAlign: 'center', color: 'var(--t3)', fontSize: 12, lineHeight: 1.75 }}>
                  <Clock size={22} strokeWidth={1.4} style={{ opacity: 0.4 }} />
                  Your edits appear here.<br />Try a prompt below.
                </div>
              ) : (
                [...history.slice(1)].reverse().map((entry, ri) => {
                  const actualIdx = history.length - 1 - ri
                  const isCurrent = actualIdx === historyIndex
                  return (
                    <motion.div
                      key={entry.timestamp}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => jumpToHistory(actualIdx)}
                      style={{
                        background: isCurrent ? 'var(--ag2)' : 'var(--s2)',
                        border: `1px solid ${isCurrent ? 'var(--a)' : 'var(--b1)'}`,
                        borderRadius: 'var(--r)', padding: '8px 10px',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'flex-start', gap: 7,
                        transition: 'all var(--fast)',
                      }}
                    >
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: isCurrent ? 'var(--a)' : 'var(--t3)',
                        boxShadow: isCurrent ? '0 0 8px var(--a)' : 'none',
                        marginTop: 5, flexShrink: 0, transition: 'all var(--fast)',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--t1)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.label}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                          {ri === 0 ? 'Current state' : `${ri} step${ri > 1 ? 's' : ''} ago`}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); jumpToHistory(actualIdx - 1) }}
                        title="Undo this step"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 0, fontSize: 11, flexShrink: 0, transition: 'color var(--fast)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
                      >↩</button>
                    </motion.div>
                  )
                })
              )}
            </motion.div>
          )}

          {activeTab === 'layers' && (
            <motion.div
              key="layers"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              {/* Adjustment Layers Section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: '0 2px' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>
                    Adjustment Masks
                  </span>
                  {imageEl && (
                    <button
                      onClick={() => {
                        useEditorStore.getState().addAdjustmentLayer()
                        useEditorStore.getState().setActiveTool('mask')
                        pushHistory('Add Mask Layer')
                      }}
                      style={{
                        background: 'var(--s3)', border: '1px solid var(--b2)', borderRadius: 4,
                        color: 'var(--t1)', fontSize: 10, padding: '2px 8px', cursor: 'pointer',
                        fontWeight: 500, transition: 'all var(--fast)'
                      }}
                    >
                      + Add Mask
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {useEditorStore(s => s.adjustmentLayers).length === 0 ? (
                    <div style={{ padding: '12px 6px', textAlign: 'center', color: 'var(--t3)', fontSize: 11, background: 'var(--s2)', borderRadius: 'var(--r)', border: '1px dashed var(--b1)' }}>
                      No adjustments masks yet
                    </div>
                  ) : (
                    [...useEditorStore(s => s.adjustmentLayers)].reverse().map(adjLayer => {
                      const isActive = useEditorStore(s => s.activeAdjustmentLayerId) === adjLayer.id
                      return (
                        <div
                          key={adjLayer.id}
                          onClick={() => {
                            useEditorStore.getState().setActiveAdjustmentLayer(adjLayer.id)
                            useEditorStore.getState().setActiveTool('mask')
                          }}
                          style={{
                            background: isActive ? 'var(--ag2)' : 'var(--s2)',
                            border: `1px solid ${isActive ? 'var(--a)' : 'var(--b1)'}`,
                            borderRadius: 'var(--r)',
                            padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8,
                            cursor: 'pointer', transition: 'all var(--fast)'
                          }}
                        >
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              useEditorStore.getState().setAdjustmentLayerVisibility(adjLayer.id, !adjLayer.visible)
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                          >
                            {adjLayer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>
                          <div style={{ flex: 1, fontSize: 11.5, color: adjLayer.visible ? 'var(--t1)' : 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}>
                            {adjLayer.name}
                          </div>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              useEditorStore.getState().removeAdjustmentLayer(adjLayer.id)
                              pushHistory('Delete Mask Layer')
                            }}
                            style={{
                              background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer',
                              fontSize: 12, padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center'
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}
                          >
                            ×
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Pixel Layers Section */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6, padding: '0 2px' }}>
                  Image Layers
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {layers.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 12px', textAlign: 'center', color: 'var(--t3)', fontSize: 12, lineHeight: 1.75 }}>
                      <Layers size={22} strokeWidth={1.4} style={{ opacity: 0.4 }} />
                      Load a photo to see layers.
                    </div>
                  ) : (
                    [...layers].reverse().map(layer => (
                      <div
                        key={layer.id}
                        style={{
                          background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 'var(--r)',
                          padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
                        }}
                      >
                        <button
                          onClick={() => toggleLayerVisibility(layer.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 0, flexShrink: 0 }}
                        >
                          {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        <div style={{ flex: 1, fontSize: 12, color: layer.visible ? 'var(--t1)' : 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {layer.name}
                        </div>
                        <span style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {layer.type}
                        </span>
                        <button
                          onClick={() => toggleLayerLock(layer.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 0, flexShrink: 0 }}
                        >
                          {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'wf' && (
            <motion.div
              key="wf"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
            >
              <WorkflowsTab />
            </motion.div>
          )}

          {activeTab === 'batch' && (
            <motion.div
              key="batch"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              style={{ height: '100%' }}
            >
              <BatchPanel />
            </motion.div>
          )}

          {activeTab === 'info' && (
            <motion.div
              key="info"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
            >
              {imageEl ? (
                <div style={{ padding: 8 }}>
                  {[
                    { k: 'Filename', v: imageName.length > 20 ? imageName.slice(0, 20) + '…' : imageName },
                    { k: 'Dimensions', v: `${imageEl.naturalWidth} × ${imageEl.naturalHeight}` },
                    { k: 'File size', v: fmtSz(imageSize) },
                    { k: 'Megapixels', v: `${(imageEl.naturalWidth * imageEl.naturalHeight / 1e6).toFixed(1)} MP` },
                    { k: 'Aspect ratio', v: aspectRatio(imageEl.naturalWidth, imageEl.naturalHeight) },
                    { k: 'Edits applied', v: String(editCount) },
                  ].map(row => (
                    <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 2px', borderBottom: '1px solid var(--b1)', fontSize: 12 }}>
                      <span style={{ color: 'var(--t3)' }}>{row.k}</span>
                      <span style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{row.v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 12px', textAlign: 'center', color: 'var(--t3)', fontSize: 12, lineHeight: 1.75 }}>
                  Load an image to<br />see file details.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  )
}
