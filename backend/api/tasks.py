"""
Celery tasks for the Lumio image processing pipeline.

Tasks:
  - process_image_adjustments: apply Lightroom-style numeric adjustments via OpenCV
  - run_background_removal: remove background using rembg (U2Net ONNX model)
"""
import os
import io
import logging

import cv2
import numpy as np
from PIL import Image as PILImage
from celery import shared_task
from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _clamp(arr: np.ndarray) -> np.ndarray:
    return np.clip(arr, 0, 255).astype(np.uint8)


def _load_cv2(path: str) -> np.ndarray:
    """Load image via OpenCV; fall back to PIL for exotic formats."""
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is not None:
        return img
    pil = PILImage.open(path).convert('RGB')
    return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)


# ─── Task 1: Adjustments ──────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=5)
def process_image_adjustments(self, image_id: str, adjustments: dict):
    """
    Apply the full Lumio adjustments pipeline server-side on the original image,
    saving the result to Image.processed_file as a high-quality JPEG.
    """
    from api.models import Image as ImageModel
    try:
        instance = ImageModel.objects.get(id=image_id)
    except ImageModel.DoesNotExist:
        logger.error('process_image_adjustments: Image %s not found', image_id)
        return f'Image {image_id} not found'

    try:
        orig_path = instance.original_file.path
        img = _load_cv2(orig_path).astype(float)

        # 1. Exposure (stops)
        exposure = adjustments.get('exposure', 0)
        if exposure:
            img = img * (2 ** ((exposure / 100) * 2.2))

        # 2. Brightness offset
        brightness = adjustments.get('brightness', 0)
        if brightness:
            img = img + (brightness / 100) * 85

        # 3. Contrast (scaled around 128)
        contrast = adjustments.get('contrast', 0)
        if contrast:
            factor = 1.0 + (contrast / 100) * 1.85
            img = (img - 128.0) * factor + 128.0

        img = _clamp(img)

        # 4. Saturation (HSV channel S)
        saturation = adjustments.get('saturation', 0)
        if saturation:
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(float)
            hsv[:, :, 1] = np.clip(hsv[:, :, 1] * (1.0 + saturation / 100), 0, 255)
            img = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

        # 5. Hue rotation
        hue = adjustments.get('hue', 0)
        if hue:
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(float)
            hsv[:, :, 0] = (hsv[:, :, 0] + hue / 2.0) % 180
            img = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

        # 6. Temperature (blue–yellow shift)
        temperature = adjustments.get('temperature', 0)
        if temperature:
            offset = (temperature / 100) * 40
            img = img.astype(float)
            img[:, :, 0] = np.clip(img[:, :, 0] - offset, 0, 255)  # B
            img[:, :, 2] = np.clip(img[:, :, 2] + offset, 0, 255)  # R
            img = img.astype(np.uint8)

        # 7. Tint (magenta–green shift on G channel)
        tint = adjustments.get('tint', 0)
        if tint:
            img = img.astype(float)
            img[:, :, 1] = np.clip(img[:, :, 1] + (tint / 100) * 30, 0, 255)  # G
            img = img.astype(np.uint8)

        # 8. Highlights / Shadows (simple curve approximation)
        highlights = adjustments.get('highlights', 0)
        shadows = adjustments.get('shadows', 0)
        if highlights or shadows:
            lut = np.arange(256, dtype=float)
            if highlights:
                hl_mask = lut / 255.0
                lut = lut + hl_mask * (highlights / 100) * 60
            if shadows:
                sh_mask = 1.0 - lut / 255.0
                lut = lut + sh_mask * (shadows / 100) * 60
            lut = np.clip(lut, 0, 255).astype(np.uint8)
            img = cv2.LUT(img, lut)

        # 9. Sharpness (unsharp mask)
        sharpness = adjustments.get('sharpness', 0)
        if sharpness > 0:
            blurred = cv2.GaussianBlur(img, (0, 0), 3)
            img = cv2.addWeighted(img, 1 + sharpness / 100, blurred, -(sharpness / 100), 0)

        # 10. Vignette
        vignette = adjustments.get('vignette', 0)
        if vignette < 0:
            h, w = img.shape[:2]
            kx = cv2.getGaussianKernel(w, w / 2)
            ky = cv2.getGaussianKernel(h, h / 2)
            kernel = ky * kx.T
            mask = kernel / kernel.max()
            mask = 1.0 - (1.0 - mask) * abs(vignette / 100.0)
            img = _clamp(img * np.dstack([mask] * 3))

        # Save output
        _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        fname = f'adj_{os.path.basename(orig_path)}'
        instance.processed_file.save(fname, ContentFile(buf.tobytes()), save=True)
        logger.info('process_image_adjustments: saved %s', instance.processed_file.name)
        return instance.processed_file.url

    except Exception as exc:
        logger.exception('process_image_adjustments failed for %s', image_id)
        raise self.retry(exc=exc)


# ─── Task 2: Background Removal ───────────────────────────────────────────────

@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def run_background_removal(self, image_id: str):
    """
    Run rembg (U2Net) on the original image and write a PNG with alpha channel
    to Image.processed_file.
    """
    from api.models import Image as ImageModel
    try:
        instance = ImageModel.objects.get(id=image_id)
    except ImageModel.DoesNotExist:
        logger.error('run_background_removal: Image %s not found', image_id)
        return f'Image {image_id} not found'

    try:
        from rembg import remove as rembg_remove

        orig_path = instance.original_file.path
        with open(orig_path, 'rb') as f:
            input_bytes = f.read()

        logger.info('run_background_removal: running rembg on %s', orig_path)
        output_bytes = rembg_remove(input_bytes)

        base = os.path.splitext(os.path.basename(orig_path))[0]
        fname = f'nobg_{base}.png'
        instance.processed_file.save(fname, ContentFile(output_bytes), save=True)
        logger.info('run_background_removal: saved %s', instance.processed_file.name)
        return instance.processed_file.url

    except Exception as exc:
        logger.exception('run_background_removal failed for %s', image_id)
        raise self.retry(exc=exc)


# ─── Task 3: Spot Healing ─────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def run_spot_healing(self, image_id: str, stroke_points: list):
    """
    Perform spot healing using OpenCV's inpaint on coordinates in stroke_points.
    stroke_points is a list of [x, y, radius] on the original image dimensions.
    """
    from api.models import Image as ImageModel
    try:
        instance = ImageModel.objects.get(id=image_id)
    except ImageModel.DoesNotExist:
        logger.error('run_spot_healing: Image %s not found', image_id)
        return f'Image {image_id} not found'

    try:
        orig_path = instance.original_file.path
        img = _load_cv2(orig_path)
        h, w = img.shape[:2]

        # Handle alpha channel (4 channels) for cv2.inpaint
        has_alpha = len(img.shape) > 2 and img.shape[2] == 4
        if has_alpha:
            bgr = img[:, :, :3]
            alpha = img[:, :, 3]
        else:
            bgr = img
            alpha = None

        # Create single-channel binary mask
        mask = np.zeros((h, w), dtype=np.uint8)

        for pt in stroke_points:
            x, y, r = int(pt[0]), int(pt[1]), int(pt[2])
            cv2.circle(mask, (x, y), r, 255, -1)

        # Inpaint using Telea algorithm
        inpainted_bgr = cv2.inpaint(bgr, mask, 3, cv2.INPAINT_TELEA)

        # Re-merge alpha channel if it existed
        if has_alpha:
            inpainted = cv2.merge([inpainted_bgr[:, :, 0], inpainted_bgr[:, :, 1], inpainted_bgr[:, :, 2], alpha])
        else:
            inpainted = inpainted_bgr

        base = os.path.splitext(os.path.basename(orig_path))[0]
        fname = f'healed_{base}.png'

        _, buf = cv2.imencode('.png', inpainted)
        instance.processed_file.save(fname, ContentFile(buf.tobytes()), save=True)
        logger.info('run_spot_healing: saved %s', instance.processed_file.name)
        return instance.processed_file.url

    except Exception as exc:
        logger.exception('run_spot_healing failed for %s', image_id)
        raise self.retry(exc=exc)


# ─── Task 4: Clone Stamp ──────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def run_clone_stamp(self, image_id: str, src_x: int, src_y: int, strokes: list):
    """
    Clone pixels from source region (src_x, src_y) to each destination stroke.
    strokes is a list of [dst_x, dst_y, radius] in original image coordinates.
    For each stroke point, a circular region of radius `r` centered at (dst_x, dst_y)
    is replaced by the same-offset region from the source.
    """
    from api.models import Image as ImageModel
    try:
        instance = ImageModel.objects.get(id=image_id)
    except ImageModel.DoesNotExist:
        logger.error('run_clone_stamp: Image %s not found', image_id)
        return f'Image {image_id} not found'

    try:
        orig_path = instance.original_file.path
        img = _load_cv2(orig_path)
        h, w = img.shape[:2]
        result = img.copy()

        for pt in strokes:
            dst_x, dst_y, r = int(pt[0]), int(pt[1]), max(1, int(pt[2]))

            # For each pixel in the destination circle, compute offset from
            # first stroke point and copy from corresponding source location
            y_grid, x_grid = np.mgrid[-r:r+1, -r:r+1]
            circle_mask = x_grid**2 + y_grid**2 <= r**2

            for dy in range(-r, r+1):
                for dx in range(-r, r+1):
                    if dx**2 + dy**2 > r**2:
                        continue
                    sy = src_y + dy
                    sx = src_x + dx
                    dy_ = dst_y + dy
                    dx_ = dst_x + dx
                    if 0 <= sy < h and 0 <= sx < w and 0 <= dy_ < h and 0 <= dx_ < w:
                        result[dy_, dx_] = img[sy, sx]

        base = os.path.splitext(os.path.basename(orig_path))[0]
        fname = f'stamp_{base}.png'
        _, buf = cv2.imencode('.png', result)
        instance.processed_file.save(fname, ContentFile(buf.tobytes()), save=True)
        logger.info('run_clone_stamp: saved %s', instance.processed_file.name)
        return instance.processed_file.url

    except Exception as exc:
        logger.exception('run_clone_stamp failed for %s', image_id)
        raise self.retry(exc=exc)


# ─── Task 5: Workflow Runner ──────────────────────────────────────────────────

@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def run_workflow_task(self, image_id: str, workflow_id: str):
    """
    Sequentially execute all steps in the Workflow on the original image,
    saving the final outcome to processed_file.
    """
    from api.models import Image as ImageModel, Workflow as WorkflowModel
    try:
        image_instance = ImageModel.objects.get(id=image_id)
        workflow_instance = WorkflowModel.objects.get(id=workflow_id)
    except Exception as exc:
        logger.error('run_workflow_task: Image %s or Workflow %s not found', image_id, workflow_id)
        return 'Not found'

    try:
        orig_path = image_instance.original_file.path
        img = _load_cv2(orig_path)
        
        for step in workflow_instance.steps:
            stype = step.get('type')
            
            if stype == 'adjustment':
                adjustments = step.get('adjustments', {})
                img_float = img.astype(float)
                
                exposure = adjustments.get('exposure', 0)
                if exposure:
                    img_float = img_float * (2 ** ((exposure / 100) * 2.2))
                brightness = adjustments.get('brightness', 0)
                if brightness:
                    img_float = img_float + (brightness / 100) * 85
                contrast = adjustments.get('contrast', 0)
                if contrast:
                    factor = 1.0 + (contrast / 100) * 1.85
                    img_float = (img_float - 128.0) * factor + 128.0
                img = _clamp(img_float)
                
                saturation = adjustments.get('saturation', 0)
                if saturation:
                    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(float)
                    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * (1.0 + saturation / 100), 0, 255)
                    img = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
                
                hue = adjustments.get('hue', 0)
                if hue:
                    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(float)
                    hsv[:, :, 0] = (hsv[:, :, 0] + hue / 2.0) % 180
                    img = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
                
                temperature = adjustments.get('temperature', 0)
                if temperature:
                    offset = (temperature / 100) * 40
                    img = img.astype(float)
                    img[:, :, 0] = np.clip(img[:, :, 0] - offset, 0, 255)
                    img[:, :, 2] = np.clip(img[:, :, 2] + offset, 0, 255)
                    img = img.astype(np.uint8)
                
                tint = adjustments.get('tint', 0)
                if tint:
                    img = img.astype(float)
                    img[:, :, 1] = np.clip(img[:, :, 1] + (tint / 100) * 30, 0, 255)
                    img = img.astype(np.uint8)
                
                highlights = adjustments.get('highlights', 0)
                shadows = adjustments.get('shadows', 0)
                if highlights or shadows:
                    lut = np.arange(256, dtype=float)
                    if highlights:
                        hl_mask = lut / 255.0
                        lut = lut + hl_mask * (highlights / 100) * 60
                    if shadows:
                        sh_mask = 1.0 - lut / 255.0
                        lut = lut + sh_mask * (shadows / 100) * 60
                    lut = np.clip(lut, 0, 255).astype(np.uint8)
                    img = cv2.LUT(img, lut)
                
                sharpness = adjustments.get('sharpness', 0)
                if sharpness > 0:
                    blurred = cv2.GaussianBlur(img, (0, 0), 3)
                    img = cv2.addWeighted(img, 1 + sharpness / 100, blurred, -(sharpness / 100), 0)
                
                vignette = adjustments.get('vignette', 0)
                if vignette < 0:
                    h, w = img.shape[:2]
                    kx = cv2.getGaussianKernel(w, w / 2)
                    ky = cv2.getGaussianKernel(h, h / 2)
                    kernel = ky * kx.T
                    mask = kernel / kernel.max()
                    mask = 1.0 - (1.0 - mask) * abs(vignette / 100.0)
                    img = _clamp(img * np.dstack([mask] * 3))

            elif stype == 'remove_background':
                from rembg import remove as rembg_remove
                _, input_bytes = cv2.imencode('.png', img)
                output_bytes = rembg_remove(input_bytes.tobytes())
                img = cv2.imdecode(np.frombuffer(output_bytes, np.uint8), cv2.IMREAD_UNCHANGED)

        base = os.path.splitext(os.path.basename(orig_path))[0]
        fname = f'wf_{workflow_instance.name.replace(" ", "_")}_{base}.png'
        _, buf = cv2.imencode('.png', img)
        image_instance.processed_file.save(fname, ContentFile(buf.tobytes()), save=True)
        logger.info('run_workflow_task completed and saved for image %s', image_id)
        return image_instance.processed_file.url

    except Exception as exc:
        logger.exception('run_workflow_task failed')
        raise self.retry(exc=exc)
