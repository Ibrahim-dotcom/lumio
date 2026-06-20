/**
 * useUpload — handles file → backend project/image creation flow.
 *
 * On drop / file-select we:
 *   1. Create a Project on the backend.
 *   2. Upload the original file to /api/images/.
 *   3. Load the image into the canvas.
 * Resolves the promise only after the image has finished loading.
 */
import { useState, useCallback } from 'react'
import { useEditorStore } from '../store/editorStore'
import * as api from '../services/api'

interface UploadState {
  isUploading: boolean
  progress: number
  error: string | null
}

export function useUpload() {
  const setImage = useEditorStore(s => s.setImage)
  const setBackendIds = useEditorStore(s => s.setBackendIds)

  const [state, setState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
  })

  const upload = useCallback((file: File): Promise<void> => {
    setState({ isUploading: true, progress: 10, error: null })

    return new Promise<void>(async (resolve, reject) => {
      try {
        // 1. Create a project
        setState(s => ({ ...s, progress: 25 }))
        const baseName = file.name.replace(/\.[^/.]+$/, '')
        const project = await api.createProject(baseName)

        // 2. Upload image to backend
        setState(s => ({ ...s, progress: 55 }))
        const image = await api.uploadImage(project.id, file)

        // 3. Load into canvas via a local object URL (always same-origin → no canvas taint)
        //    Backend IDs are still stored so future API calls (bg removal, export) work.
        setState(s => ({ ...s, progress: 80 }))
        const localUrl = URL.createObjectURL(file)
        const img = new Image()

        img.onload = () => {
          setImage(img, file.name, file.size)
          setBackendIds(project.id, image.id)
          setState({ isUploading: false, progress: 100, error: null })
          resolve()
        }

        img.onerror = () => {
          const err = new Error('Failed to load image from object URL')
          setState({ isUploading: false, progress: 0, error: err.message })
          reject(err)
        }

        img.src = localUrl

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState({ isUploading: false, progress: 0, error: msg })

        // Load locally as a pure fallback so user is not blocked
        try {
          const localUrl = URL.createObjectURL(file)
          const fallbackImg = new Image()
          fallbackImg.onload = () => {
            setImage(fallbackImg, file.name, file.size)
            // Explicitly do not set backend IDs here
          }
          fallbackImg.src = localUrl
        } catch {/* ignore */}

        reject(err)
      }
    })
  }, [setImage, setBackendIds])

  return { upload, ...state }
}
