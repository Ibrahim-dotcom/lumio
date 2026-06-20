/**
 * useBackgroundRemoval — fires the rembg task on the backend
 * and polls for completion, then swaps the canvas image.
 *
 * If backendImageId is not yet set (e.g. backend was unreachable during upload),
 * this hook will attempt to sync the current canvas image to the backend
 * automatically before dispatching the removal task.
 */
import { useState, useCallback } from 'react'
import { useEditorStore } from '../store/editorStore'
import * as api from '../services/api'

type Status = 'idle' | 'syncing' | 'working' | 'done' | 'error'

export function useBackgroundRemoval() {
  const backendImageId = useEditorStore(s => s.backendImageId)
  const projectId = useEditorStore(s => s.projectId)
  const imageEl = useEditorStore(s => s.imageEl)
  const swapImage = useEditorStore(s => s.swapImage)
  const pushHistory = useEditorStore(s => s.pushHistory)
  const setBackendIds = useEditorStore(s => s.setBackendIds)
  const imageName = useEditorStore(s => s.imageName)
  const imageSize = useEditorStore(s => s.imageSize)
  const showToast = useEditorStore(s => s.showToast)

  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)

  /** Extract the current canvas image as a PNG Blob */
  function extractImageBlob(img: HTMLImageElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || img.width
      canvas.height = img.naturalHeight || img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas 2d context unavailable'))
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('toBlob returned null'))
      }, 'image/png')
    })
  }

  const remove = useCallback(async () => {
    if (!imageEl) {
      showToast('Upload an image first', true)
      return
    }

    let activeImageId = backendImageId
    let activeProjectId = projectId

    // ── Step 1: If not yet synced to backend, upload now ──────────────────────
    if (!activeImageId) {
      setStatus('syncing')
      setProgress(10)
      showToast('Syncing image to server…')

      try {
        const blob = await extractImageBlob(imageEl)
        const file = new File([blob], imageName || 'canvas-export.png', { type: 'image/png' })

        // Create project if needed
        if (!activeProjectId) {
          const project = await api.createProject(imageName?.replace(/\.[^/.]+$/, '') || 'Untitled')
          activeProjectId = project.id
        }

        const uploaded = await api.uploadImage(activeProjectId, file)
        activeImageId = uploaded.id
        setBackendIds(activeProjectId, activeImageId)
        setProgress(30)
      } catch (syncErr) {
        setStatus('error')
        setProgress(0)
        showToast(
          'Failed to sync image with backend. Is Django running on port 8000?',
          true,
        )
        return
      }
    }

    // ── Step 2: Dispatch the background removal task ──────────────────────────
    setStatus('working')
    setProgress(35)

    try {
      await api.removeBackground(activeImageId)
      setProgress(45)

      // ── Step 3: Poll for processed_file ────────────────────────────────────
      const deadline = Date.now() + 90_000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2000))
        const updated = await api.getTaskStatus(activeImageId)
        if (updated.processed_file) {
          setProgress(90)
          const backendRoot = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
          const url = updated.processed_file.startsWith('http')
            ? updated.processed_file
            : `${backendRoot}${updated.processed_file}`

          const img = new Image()
          img.crossOrigin = 'anonymous'   // must be set BEFORE src to avoid canvas taint
          img.onload = () => {
            swapImage(img, imageName, imageSize)
            pushHistory('Cutout Background')
            setStatus('done')
            setProgress(100)
            showToast('Background removed!', false)
          }
          img.onerror = () => {
            setStatus('error')
            showToast('Failed to load processed image from server', true)
          }
          img.src = url
          return
        }
      }

      setStatus('error')
      showToast('Background removal timed out. Check that Celery worker is running.', true)
    } catch (err) {
      setStatus('error')
      setProgress(0)
      showToast(err instanceof Error ? err.message : 'Background removal failed', true)
    }
  }, [
    backendImageId, projectId, imageEl,
    swapImage, pushHistory, setBackendIds,
    imageName, imageSize, showToast,
  ])

  return {
    remove,
    status,
    progress,
    isWorking: status === 'working' || status === 'syncing',
  }
}
