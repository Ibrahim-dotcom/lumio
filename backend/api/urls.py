from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import ProjectViewSet, ImageViewSet, EditHistoryViewSet, WorkflowViewSet
from django.http import JsonResponse

def health_check(request):
    return JsonResponse({"status": "healthy", "service": "lumio-api"})

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'images', ImageViewSet, basename='image')
router.register(r'edits', EditHistoryViewSet, basename='edithistory')
router.register(r'workflows', WorkflowViewSet, basename='workflow')

urlpatterns = [
    path('health/', health_check),
    path('', include(router.urls)),
]
