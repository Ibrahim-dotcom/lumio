from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings
from django.db.models import Q
from api.models import Project, Image, EditHistory, Workflow
from api.serializers import (
    ProjectSerializer, ImageSerializer,
    EditHistorySerializer, WorkflowSerializer,
)
from api.tasks import process_image_adjustments, run_background_removal, run_spot_healing, run_clone_stamp
from PIL import Image as PILImage
import json
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
A user will describe a photo edit in natural language. You translate it into pixel adjustments.

ADJUSTMENT KEYS AND RANGES:
exposure: -100 to 100, brightness: -100 to 100, contrast: -100 to 100,
highlights: -100 to 100, shadows: -100 to 100, whites: -100 to 100, blacks: -100 to 100,
temperature: -100 to 100, tint: -100 to 100, saturation: -100 to 100,
vibrance: -100 to 100, hue: -180 to 180, sharpness: 0 to 100,
clarity: -100 to 100, dehaze: -100 to 100, noise: 0 to 100,
vignette: -100 to 0 (ALWAYS negative), grain: 0 to 100, fade: 0 to 100, glow: 0 to 100

RULES:
1. Return ONLY raw JSON. No markdown, no explanation.
2. Include ONLY keys that should change.
3. Values are DELTA from current.
4. "slightly/a bit" = *0.35, "very/extremely" = *1.65.
5. If request cannot be mapped return {"_unsupported":true}.
6. Cinematic = contrast+cool+vignette. Dreamy = glow+clarity-+fade. Film = grain+fade+desaturate.
"""

def _fallback_parse(prompt: str) -> dict:
    lo = prompt.lower()
    result = {}
    hit = False
    for patterns, adj in FALLBACK_RULES:
        for p in patterns:
            if p in lo:
                result.update(adj)
                hit = True
                break
    if not hit:
        return {'_unsupported': True}
    import re
    strong = bool(re.search(r'\b(very|extremely|super|heavily)\b', lo))
    light  = bool(re.search(r'\b(slightly|a bit|subtle|barely|gently)\b', lo))
    factor = 1.65 if strong else 0.35 if light else 1.0
    return {k: round(v * factor) for k, v in result.items()}


class AIPlannerView(APIView):
    """
    POST /api/ai/plan/
    Body: { "prompt": str }
    Returns: { "deltas": {...} } or { "_unsupported": true }

    Keeps the Gemini API key server-side — never exposed to the browser.
    Falls back to keyword parser if no key is configured or Gemini errors.
    """

    def post(self, request):
        prompt = request.data.get('prompt', '').strip()
        if not prompt:
            return Response({'error': 'prompt is required'}, status=status.HTTP_400_BAD_REQUEST)

        api_key = getattr(settings, 'GEMINI_API_KEY', '')
        if api_key:
            try:
                url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}'
                payload = {
                    'contents': [{'parts': [{'text': f'{SYSTEM_PROMPT}\n\nUser request: "{prompt}"'}]}],
                    'generationConfig': {'responseMimeType': 'application/json'}
                }
                resp = http_requests.post(url, json=payload, timeout=15)
                resp.raise_for_status()
                raw = resp.json()
                text = raw['candidates'][0]['content']['parts'][0]['text'].strip()
                deltas = json.loads(text)
                logger.info('[AI] Gemini responded for prompt: %s', prompt[:60])
                return Response({'deltas': deltas})
            except Exception as exc:
                logger.warning('[AI] Gemini failed (%s), using fallback', exc)

        # Fallback to keyword parser
        deltas = _fallback_parse(prompt)
        logger.info('[AI] Fallback parse for: %s', prompt[:60])
        return Response({'deltas': deltas})




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
