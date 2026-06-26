from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings
from django.db.models import Q
from api.models import Project, Image, EditHistory, Workflow, BatchJob
from api.serializers import (
    ProjectSerializer, ImageSerializer,
    EditHistorySerializer, WorkflowSerializer, BatchJobSerializer,
)
from api.tasks import process_image_adjustments, run_background_removal, run_spot_healing, run_clone_stamp, run_workflow_task, run_batch_job, run_lama_heal_task, run_detection_task
from PIL import Image as PILImage
import json
import os
from django.core.files.storage import default_storage
import requests as http_requests
import logging

logger = logging.getLogger(__name__)

# ─── Keyword fallback (no API key needed) ────────────────────────────────────
FALLBACK_RULES = [
    (['bright', 'lighten', 'lighter'],              {'brightness': 28, 'exposure': 10}),
    (['dark', 'darken', 'darker', 'moody'],         {'brightness': -24, 'exposure': -12}),
    (['contrast', 'punch', 'pop'],                  {'contrast': 32, 'clarity': 10}),
    (['warm', 'golden', 'sunset', 'orange'],        {'temperature': 38}),
    (['cool', 'cold', 'blue', 'winter'],            {'temperature': -38}),
    (['vivid', 'vibrant', 'saturated', 'colorful'], {'saturation': 42, 'vibrance': 24}),
    (['black and white', 'b&w', 'grayscale', 'monochrome'], {'saturation': -100}),
    (['sharpen', 'sharp', 'crisp', 'detail'],       {'sharpness': 55, 'clarity': 18}),
    (['soft', 'dreamy', 'glow'],                    {'glow': 42, 'clarity': -20, 'brightness': 8, 'fade': 18}),
    (['vignette', 'darken edges'],                  {'vignette': -55}),
    (['cinematic', 'cinema', 'film look', 'movie'], {'contrast': 26, 'temperature': -18, 'saturation': 18, 'vignette': -38, 'clarity': 12}),
    (['vintage', 'retro', 'film grain'],            {'saturation': -20, 'contrast': -15, 'temperature': 20, 'grain': 28, 'fade': 20}),
    (['dramatic', 'hdr', 'epic', 'intense'],        {'contrast': 38, 'clarity': 42, 'saturation': 20, 'dehaze': 28}),
    (['dehaze', 'haze', 'fog', 'mist'],             {'dehaze': 50, 'contrast': 14}),
    (['matte', 'faded', 'fade'],                    {'fade': 38, 'saturation': -20, 'contrast': -22}),
    (['teal and orange', 'teal+orange'],            {'temperature': -16, 'tint': -10, 'saturation': 22, 'contrast': 18}),
    (['lift shadow', 'open shadow'],                {'shadows': 38}),
    (['recover highlight'],                         {'highlights': -40}),
    (['denoise', 'reduce noise', 'clean'],          {'noise': 62}),
    (['kodak', 'kodachrome'],                       {'fade': 26, 'grain': 20, 'saturation': -15, 'contrast': -8, 'temperature': 14}),
    (['fashion', 'luxury', 'editorial'],            {'contrast': 18, 'clarity': 14, 'vibrance': 12, 'vignette': -28}),
    (['product', 'ecommerce', 'amazon'],            {'brightness': 15, 'contrast': 12, 'saturation': 8, 'whites': 18}),
    (['portrait', 'skin', 'face'],                  {'brightness': 10, 'vibrance': 15, 'clarity': -8, 'glow': 12}),
    (['landscape', 'nature', 'outdoor'],            {'vibrance': 28, 'dehaze': 22, 'clarity': 18, 'saturation': 14}),
]

SYSTEM_PROMPT = """You are the AI engine of Lumio, a professional photo editor.
A user will describe a photo edit in natural language. You translate it into structured pixel adjustments.

ADJUSTMENT KEYS AND RANGES:
exposure: -100 to 100, brightness: -100 to 100, contrast: -100 to 100,
highlights: -100 to 100, shadows: -100 to 100, whites: -100 to 100, blacks: -100 to 100,
temperature: -100 to 100, tint: -100 to 100, saturation: -100 to 100,
vibrance: -100 to 100, hue: -180 to 180, sharpness: 0 to 100,
clarity: -100 to 100, dehaze: -100 to 100, noise: 0 to 100,
vignette: -100 to 0 (ALWAYS negative), grain: 0 to 100, fade: 0 to 100, glow: 0 to 100

OUTPUT FORMAT — always return a single JSON object with exactly these two top-level keys:
{
  "scope": "<global | sky | face | subject | background>",
  "deltas": { <only the keys that should change> }
}

SCOPE RULES:
- "global"     = edit affects the entire image (default for most prompts)
- "sky"        = user explicitly targets sky, clouds, or horizon
- "face"       = user explicitly targets skin, face, eyes, cheeks, portrait glow
- "subject"    = user explicitly targets the main foreground person/object (car, product, model, outfit)
- "background" = user explicitly targets the background only

ADJUSTMENT RULES:
1. Values are DELTA from current (positive = increase, negative = decrease).
2. "slightly / a bit" = multiply values by 0.35. "very / extremely" = multiply by 1.65.
3. Only include keys that should change — omit all unchanged sliders.
4. vignette is ALWAYS negative (e.g. -50 for a strong vignette).
5. If the request is completely unrelated to photo editing, return:
   {"scope":"global","deltas":{"_unsupported":true}}

PRESET RECIPES:
- Cinematic:   {"contrast":26,"temperature":-18,"saturation":18,"vignette":-38,"clarity":12}
- Dreamy:      {"glow":42,"clarity":-20,"brightness":8,"fade":18}
- Film/Kodak:  {"grain":28,"fade":20,"saturation":-18,"temperature":12}
- Golden hour: {"temperature":38,"saturation":20,"highlights":-10}
- Dramatic/HDR:{"contrast":38,"clarity":42,"saturation":20,"dehaze":28}
- Matte:       {"fade":38,"saturation":-20,"contrast":-22}
- Vintage:     {"saturation":-20,"contrast":-15,"temperature":20,"grain":28,"fade":20}
- Black & white:{"saturation":-100}

EXAMPLES — study these carefully:
"make the sky warm"      -> {"scope":"sky",        "deltas":{"temperature":35,"saturation":15}}
"cool blue sky"          -> {"scope":"sky",        "deltas":{"temperature":-35,"saturation":10}}
"golden sky"             -> {"scope":"sky",        "deltas":{"temperature":38,"saturation":20}}
"dramatic clouds"        -> {"scope":"sky",        "deltas":{"contrast":30,"dehaze":25,"clarity":15}}
"make the skin glow"     -> {"scope":"face",       "deltas":{"brightness":8,"vibrance":15,"clarity":-8,"glow":12}}
"smooth skin tone"       -> {"scope":"face",       "deltas":{"brightness":6,"vibrance":12,"clarity":-12}}
"warm portrait"          -> {"scope":"face",       "deltas":{"temperature":20,"vibrance":15,"brightness":8}}
"darken the background"  -> {"scope":"background", "deltas":{"brightness":-25,"exposure":-15}}
"blur the background"    -> {"scope":"background", "deltas":{"clarity":-30,"brightness":-10}}
"make the subject pop"   -> {"scope":"subject",    "deltas":{"contrast":20,"clarity":15,"vibrance":18}}
"brighten the product"   -> {"scope":"subject",    "deltas":{"exposure":20,"brightness":15}}
"add cinematic look"     -> {"scope":"global",     "deltas":{"contrast":26,"temperature":-18,"saturation":18,"vignette":-38,"clarity":12}}
"make it warmer"         -> {"scope":"global",     "deltas":{"temperature":35}}
"increase contrast"      -> {"scope":"global",     "deltas":{"contrast":30}}
"make it pop"            -> {"scope":"global",     "deltas":{"contrast":30,"clarity":20,"vibrance":20}}
"add vignette"           -> {"scope":"global",     "deltas":{"vignette":-50}}
"add film grain"         -> {"scope":"global",     "deltas":{"grain":30,"fade":15,"saturation":-10}}
"write me a poem"        -> {"scope":"global",     "deltas":{"_unsupported":true}}
"""


def _fallback_parse(prompt: str) -> dict:
    lo = prompt.lower()
    
    # Detect scope based on keywords
    scope = 'global'
    if any(p in lo for p in ['sky', 'skies', 'cloud', 'clouds', 'horizon']):
        scope = 'sky'
    elif any(p in lo for p in ['skin', 'face', 'portrait', 'eye', 'eyes', 'cheek', 'cheeks']):
        scope = 'face'
    elif any(p in lo for p in ['background', 'bg']):
        scope = 'background'
    elif any(p in lo for p in ['subject', 'foreground', 'person', 'model', 'car', 'shoes', 'clothing', 'product']):
        scope = 'subject'

    result = {}
    hit = False
    for patterns, adj in FALLBACK_RULES:
        for p in patterns:
            if p in lo:
                result.update(adj)
                hit = True
                break
    if not hit:
        return {'scope': 'global', 'deltas': {'_unsupported': True}}
    
    import re
    strong = bool(re.search(r'\b(very|extremely|super|heavily)\b', lo))
    light  = bool(re.search(r'\b(slightly|a bit|subtle|barely|gently)\b', lo))
    factor = 1.65 if strong else 0.35 if light else 1.0
    deltas = {k: round(v * factor) for k, v in result.items()}
    return {'scope': scope, 'deltas': deltas}


class AIPlannerView(APIView):
    """
    POST /api/ai/plan/
    Body: { "prompt": str }
    Returns: { "scope": str, "deltas": {...}, "source": str }

    scope is one of: global | sky | face | subject | background
    When scope != global the frontend should create a masked adjustment layer
    via /api/ai/detect/ before applying the deltas.

    Keeps the Gemini API key server-side — never exposed to the browser.
    Tries multiple Gemini models with retry logic on transient errors.
    Falls back to keyword parser only if all models fail.
    """

    # Models tried in order — first one to succeed wins
    GEMINI_MODELS = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-flash-latest',
    ]

    def _call_gemini(self, api_key: str, prompt: str) -> dict:
        """
        Try each model in sequence.
        Returns a dict with keys: scope (str) and deltas (dict).
        Gemini now returns {"scope": ..., "deltas": {...}} per the system prompt.
        """
        import time
        last_exc = None
        for model in self.GEMINI_MODELS:
            url = (
                f'https://generativelanguage.googleapis.com/v1beta/models/'
                f'{model}:generateContent?key={api_key}'
            )
            payload = {
                'contents': [{'parts': [{'text': f'{SYSTEM_PROMPT}\n\nUser request: "{prompt}"'}]}],
                'generationConfig': {'responseMimeType': 'application/json'},
            }
            for attempt in range(2):  # 2 attempts per model
                try:
                    resp = http_requests.post(url, json=payload, timeout=20)
                    if resp.status_code == 429:
                        logger.warning('[AI] Model %s rate-limited (429), trying next', model)
                        break
                    if resp.status_code == 503:
                        if attempt == 0:
                            time.sleep(1.5)
                            continue
                        logger.warning('[AI] Model %s overloaded (503), trying next', model)
                        break
                    resp.raise_for_status()
                    raw = resp.json()
                    text = raw['candidates'][0]['content']['parts'][0]['text'].strip()
                    parsed = json.loads(text)
                    # Normalise — Gemini should return {scope, deltas} but guard for old format
                    if 'deltas' in parsed and 'scope' in parsed:
                        scope = parsed['scope']
                        deltas = parsed['deltas']
                    else:
                        # Legacy / unexpected flat format — treat as global
                        scope = 'global'
                        deltas = parsed
                    logger.info('[AI] Model %s | scope=%s | prompt: %s', model, scope, prompt[:60])
                    return {'scope': scope, 'deltas': deltas}
                except Exception as exc:
                    last_exc = exc
                    logger.warning('[AI] Model %s attempt %d failed: %s', model, attempt + 1, exc)
                    if attempt == 0:
                        time.sleep(0.5)
        raise RuntimeError(f'All Gemini models failed. Last error: {last_exc}')

    def post(self, request):
        prompt = request.data.get('prompt', '').strip()
        if not prompt:
            return Response({'error': 'prompt is required'}, status=status.HTTP_400_BAD_REQUEST)

        api_key = getattr(settings, 'GEMINI_API_KEY', '')
        if api_key:
            try:
                result = self._call_gemini(api_key, prompt)
                return Response({
                    'scope': result.get('scope', 'global'),
                    'deltas': result.get('deltas', {}),
                    'source': 'gemini',
                })
            except Exception as exc:
                logger.warning('[AI] All Gemini models failed (%s), using fallback', exc)

        # Keyword fallback
        result = _fallback_parse(prompt)
        logger.info('[AI] Fallback parse for: %s | scope: %s', prompt[:60], result.get('scope'))
        return Response({
            'scope': result.get('scope', 'global'),
            'deltas': result.get('deltas', {}),
            'source': 'fallback'
        })


class HealImageView(APIView):
    """
    POST /api/ai/heal/
    Body: multipart/form-data
      - image_id: string
      - mask: file (binary mask image)
    
    Runs LaMa inpainting on the backend synchronously via Celery.
    Returns: { "url": str }
    """

    def post(self, request):
        image_id = request.data.get('image_id')
        mask_file = request.FILES.get('mask')

        if not image_id or not mask_file:
            return Response({'error': 'image_id and mask are required'}, status=status.HTTP_400_BAD_REQUEST)

        # Save mask to temp file for Celery
        try:
            mask_path = default_storage.save(f"tmp_mask_{image_id}.png", mask_file)
            full_mask_path = default_storage.path(mask_path)
            
            # Kick off celery task (synchronously wait for UI response)
            task = run_lama_heal_task.delay(image_id, full_mask_path)
            
            # Wait for result (in a real prod app we'd return 202 and poll, but for UI responsiveness we can wait briefly)
            result_url = task.get(timeout=30)
            return Response({'url': result_url})
            
        except Exception as e:
            logger.exception("HealImageView failed")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AIDetectView(APIView):
    """
    POST /api/ai/detect/
    Body: { "image_id": string, "type": "face"|"subject"|"sky" }
    Returns: { "mask": "base64_encoded_png_data" }
    """

    def post(self, request):
        image_id = request.data.get('image_id')
        detect_type = request.data.get('type')

        if not image_id or not detect_type:
            return Response({'error': 'image_id and type are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Kick off Celery task and wait synchronously for the generated base64 mask
            task = run_detection_task.delay(image_id, detect_type)
            result = task.get(timeout=30)

            if isinstance(result, dict) and 'error' in result:
                return Response(result, status=status.HTTP_400_BAD_REQUEST)

            return Response(result)

        except Exception as e:
            logger.exception("AIDetectView failed")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



class ProjectViewSet(viewsets.ModelViewSet):
    """CRUD for Projects. Supports ?search= filter by name."""
    serializer_class = ProjectSerializer

    def get_queryset(self):
        qs = Project.objects.all().order_by('-updated_at')
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)
        return qs


class ImageViewSet(viewsets.ModelViewSet):
    """CRUD for Images with auto-dimension extraction and background processing."""
    serializer_class = ImageSerializer

    def get_queryset(self):
        qs = Image.objects.all().order_by('-created_at')
        project = self.request.query_params.get('project')
        if project:
            qs = qs.filter(project=project)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Peek at file dimensions before saving
        file_obj = request.FILES.get('original_file')
        instance = serializer.save()

        if file_obj:
            instance.size_bytes = file_obj.size
            try:
                file_obj.seek(0)
                with PILImage.open(file_obj) as img:
                    instance.width, instance.height = img.size
            except Exception:
                pass
            instance.save()

        return Response(ImageSerializer(instance).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """
        Queue a Celery task to apply numeric adjustments server-side
        and write the result to `processed_file`.
        """
        image_obj = self.get_object()
        adjustments = request.data.get('adjustments', {})

        task = process_image_adjustments.delay(str(image_obj.id), adjustments)

        return Response({
            'status': 'queued',
            'task_id': task.id,
            'message': 'Image adjustment processing started.',
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'])
    def remove_background(self, request, pk=None):
        """
        Queue a Celery task to run rembg on this image.
        The processed result (PNG with alpha) is stored in `processed_file`.
        Poll GET /api/images/<id>/ for a non-null `processed_file` URL.
        """
        image_obj = self.get_object()

        if not image_obj.original_file:
            return Response(
                {'detail': 'No source image available.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = run_background_removal.delay(str(image_obj.id))

        return Response({
            'status': 'queued',
            'task_id': task.id,
            'message': 'Background removal started. Poll GET /api/images/<id>/ for processed_file.',
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'])
    def heal(self, request, pk=None):
        """
        Queue a Celery task to perform spot healing (inpainting) using OpenCV.
        Expects request.data to have:
            - stroke_points: list of [x, y, radius]
        """
        image_obj = self.get_object()
        stroke_points = request.data.get('stroke_points', [])

        if not stroke_points:
            return Response(
                {'detail': 'stroke_points list is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        task = run_spot_healing.delay(str(image_obj.id), stroke_points)

        return Response({
            'status': 'queued',
            'task_id': task.id,
            'message': 'Spot healing task started.',
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'])
    def clone_stamp(self, request, pk=None):
        """
        Queue a Celery task to clone-stamp pixels.
        Expects request.data to have:
            - src_x: int  (source region center X in original image pixels)
            - src_y: int  (source region center Y in original image pixels)
            - strokes: list of [dst_x, dst_y, radius]
        """
        image_obj = self.get_object()
        src_x = request.data.get('src_x')
        src_y = request.data.get('src_y')
        strokes = request.data.get('strokes', [])

        if src_x is None or src_y is None or not strokes:
            return Response(
                {'detail': 'src_x, src_y, and strokes are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = run_clone_stamp.delay(str(image_obj.id), int(src_x), int(src_y), strokes)

        return Response({
            'status': 'queued',
            'task_id': task.id,
            'message': 'Clone stamp task started.',
        }, status=status.HTTP_202_ACCEPTED)


class EditHistoryViewSet(viewsets.ModelViewSet):
    """CRUD for per-project edit history snapshots."""
    serializer_class = EditHistorySerializer

    def get_queryset(self):
        qs = EditHistory.objects.all().order_by('-timestamp')
        project = self.request.query_params.get('project')
        if project:
            qs = qs.filter(project=project)
        return qs


class WorkflowViewSet(viewsets.ModelViewSet):
    """CRUD for reusable saved Workflows."""
    queryset = Workflow.objects.all().order_by('-created_at')
    serializer_class = WorkflowSerializer

    @action(detail=True, methods=['post'])
    def run(self, request, pk=None):
        """
        Run this workflow on a target image.
        Expects request.data to have:
            - image_id: str
        """
        workflow = self.get_object()
        image_id = request.data.get('image_id')

        if not image_id:
            return Response(
                {'detail': 'image_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = run_workflow_task.delay(str(image_id), str(workflow.id))

        return Response({
            'status': 'queued',
            'task_id': task.id,
            'message': 'Workflow runner started.',
        }, status=status.HTTP_202_ACCEPTED)


class BatchJobViewSet(viewsets.ModelViewSet):
    """
    CRUD for BatchJobs.
    POST /api/batch/ — create a job (provide image_ids + optional workflow or adjustments)
    POST /api/batch/<id>/start/ — queue the job via Celery
    POST /api/batch/<id>/upload_and_start/ — accept multipart image files, auto-upload each,
        then start the batch. Use when you want to submit raw files directly from the browser.
    GET  /api/batch/<id>/ — poll status (processed, total, results)
    """
    serializer_class = BatchJobSerializer
    queryset = BatchJob.objects.all().order_by('-created_at')

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Queue this batch job via Celery."""
        job = self.get_object()
        if job.status == 'running':
            return Response({'detail': 'Job is already running.'}, status=status.HTTP_400_BAD_REQUEST)
        if not job.image_ids:
            return Response({'detail': 'No image_ids provided.'}, status=status.HTTP_400_BAD_REQUEST)

        job.status = 'pending'
        job.save(update_fields=['status'])
        task = run_batch_job.delay(str(job.id))
        return Response({
            'status': 'queued',
            'task_id': task.id,
            'message': f'Batch job started: {len(job.image_ids)} images queued.',
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=['post'])
    def upload_and_start(self, request):
        """
        Accept multiple raw image files via multipart (field name: 'files'),
        auto-create a Project + upload each as an Image, then launch a batch job.
        Optional body fields:
          - name (str): job name
          - workflow_id (str): optional workflow UUID
          - adjustments (JSON str): optional inline adjustments dict
        """
        files = request.FILES.getlist('files')
        if not files:
            return Response({'detail': 'No files provided. Send files[] multipart.'}, status=status.HTTP_400_BAD_REQUEST)

        job_name = request.data.get('name', f'Batch Job ({len(files)} images)')
        workflow_id = request.data.get('workflow_id', None)
        adjustments_raw = request.data.get('adjustments', '{}')
        try:
            adjustments = json.loads(adjustments_raw) if isinstance(adjustments_raw, str) else adjustments_raw
        except Exception:
            adjustments = {}

        # Create one project for this batch
        project = Project.objects.create(name=job_name)

        image_ids = []
        for file_obj in files:
            instance = Image(project=project, original_file=file_obj)
            instance.size_bytes = file_obj.size
            try:
                file_obj.seek(0)
                with PILImage.open(file_obj) as img:
                    instance.width, instance.height = img.size
            except Exception:
                pass
            instance.save()
            image_ids.append(str(instance.id))

        # Create and queue the BatchJob
        batch_kwargs = {
            'name': job_name,
            'image_ids': image_ids,
            'adjustments': adjustments,
        }
        if workflow_id:
            try:
                wf = Workflow.objects.get(id=workflow_id)
                batch_kwargs['workflow'] = wf
            except Workflow.DoesNotExist:
                pass

        job = BatchJob.objects.create(**batch_kwargs)
        task = run_batch_job.delay(str(job.id))

        return Response({
            'batch_job_id': str(job.id),
            'task_id': task.id,
            'image_ids': image_ids,
            'message': f'Batch started: {len(files)} images queued.',
        }, status=status.HTTP_202_ACCEPTED)
