import React, { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Maximize2 } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import * as api from '../../services/api'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export function BatchPreviewOverlay() {
  const batchPreviewId = useEditorStore(s => s.batchPreviewId)
  const setBatchPreview = useEditorStore(s => s.setBatchPreview)
  
  const [loading, setLoading] = useState(false)
  const [imageDetails, setImageDetails] = useState<api.ApiImage | null>(null)
  
  // Slider state (0 to 100)
  const [sliderPos, setSliderPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!batchPreviewId) {
      setImageDetails(null)
      return
    }

    setLoading(true)
    // Fetch image details to get both original and processed URLs
    api.getImage(batchPreviewId)
      .then(res => setImageDetails(res))
      .catch(console.error)
      .finally(() => setLoading(false))
      
  }, [batchPreviewId])

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    let clientX = 0
    if ('touches' in e) {
      clientX = e.touches[0].clientX
    } else {
      clientX = (e as React.MouseEvent).clientX
    }
    
    let x = clientX - rect.left
    if (x < 0) x = 0
    if (x > rect.width) x = rect.width
    
    setSliderPos((x / rect.width) * 100)
  }

  if (!batchPreviewId) return null

  const origUrl = imageDetails?.original_file 
    ? (imageDetails.original_file.startsWith('http') ? imageDetails.original_file : `${BASE}${imageDetails.original_file}`)
    : null
    
  const procUrl = imageDetails?.processed_file
    ? (imageDetails.processed_file.startsWith('http') ? imageDetails.processed_file : `${BASE}${imageDetails.processed_file}`)
    : null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'absolute',
          top: 20, right: 20, bottom: 20, left: 20,
          background: 'var(--s1)',
          borderRadius: 'var(--r3)',
          border: '1px solid var(--b2)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          height: 48, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--b1)', background: 'var(--s2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Maximize2 size={16} color="var(--a)" />
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.02em', color: 'var(--t1)' }}>
              Batch Result Preview
            </span>
            {imageDetails && (
              <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 8 }}>
                {imageDetails.filename}
              </span>
            )}
          </div>
          <button
            onClick={() => setBatchPreview(null)}
            style={{
              width: 28, height: 28, borderRadius: 'var(--r)', border: 'none',
              background: 'var(--s3)', color: 'var(--t2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--checker)', overflow: 'hidden' }}>
          {loading && <Loader2 className="spinner" size={32} color="var(--a)" />}
          
          {!loading && origUrl && procUrl && (
            <div 
              ref={containerRef}
              onMouseMove={handleMouseMove}
              onTouchMove={handleMouseMove}
              style={{
                position: 'relative',
                width: '100%', height: '100%',
                cursor: 'crosshair',
                userSelect: 'none'
              }}
            >
              {/* Original Image (Background) */}
              <img 
                src={origUrl} 
                alt="Original" 
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  objectFit: 'contain'
                }} 
              />
              
              {/* Processed Image (Clipped overlay) */}
              <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)`
              }}>
                <img 
                  src={procUrl} 
                  alt="Processed" 
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    objectFit: 'contain'
                  }} 
                />
              </div>

              {/* Slider Handle */}
              <div style={{
                position: 'absolute',
                top: 0, bottom: 0,
                left: `${sliderPos}%`,
                width: 2,
                background: '#fff',
                boxShadow: '0 0 10px rgba(0,0,0,0.5)',
                transform: 'translateX(-50%)'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 32, height: 32,
                  background: '#fff',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  color: '#000',
                  fontSize: 10, fontWeight: 800, letterSpacing: '2px'
                }}>
                  &lt;&gt;
                </div>
              </div>
              
              {/* Labels */}
              <div style={{ position: 'absolute', bottom: 20, left: 20, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 4, color: '#fff', fontSize: 11, fontWeight: 600 }}>
                PROCESSED
              </div>
              <div style={{ position: 'absolute', bottom: 20, right: 20, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 4, color: '#fff', fontSize: 11, fontWeight: 600 }}>
                ORIGINAL
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
