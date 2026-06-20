from rest_framework import serializers
from api.models import Project, Image, EditHistory, Workflow

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
