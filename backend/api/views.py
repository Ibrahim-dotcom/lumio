from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from api.models import Project, Image, EditHistory, Workflow
from api.serializers import (
    ProjectSerializer, ImageSerializer,
    EditHistorySerializer, WorkflowSerializer,
)
from api.tasks import process_image_adjustments, run_background_removal, run_spot_healing
from PIL import Image as PILImage


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
