from django.db import models
import uuid

class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class Image(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name='images', on_delete=models.CASCADE)
    original_file = models.ImageField(upload_to='uploads/originals/')
    processed_file = models.ImageField(upload_to='uploads/processed/', null=True, blank=True)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    size_bytes = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Image for {self.project.name} ({self.id})"

class EditHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, related_name='edits', on_delete=models.CASCADE)
    label = models.CharField(max_length=255)
    adjustments = models.JSONField(default=dict)
    hsl = models.JSONField(default=dict)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.label} @ {self.timestamp}"

class Workflow(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    steps = models.JSONField(default=list) # e.g. [{"action": "remove_background"}, {"action": "resize", "w": 800}]
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
