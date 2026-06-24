from rest_framework import serializers
from api.models import Project, Image, EditHistory, Workflow, BatchJob

class ImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Image
        fields = '__all__'

class EditHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EditHistory
        fields = '__all__'

class ProjectSerializer(serializers.ModelSerializer):
    images = ImageSerializer(many=True, read_only=True)
    edits = EditHistorySerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = '__all__'

class WorkflowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workflow
        fields = '__all__'

class BatchJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = BatchJob
        fields = '__all__'
        read_only_fields = ('status', 'total', 'processed', 'failed_count', 'results', 'created_at', 'updated_at')
