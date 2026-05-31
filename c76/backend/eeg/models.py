from django.db import models
from django.contrib.auth.models import User
import json


class Session(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    name = models.CharField(max_length=255)
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)
    duration = models.FloatField(default=0)
    average_attention = models.FloatField(default=0)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-start_time']

    def __str__(self):
        return f"{self.name} - {self.start_time.strftime('%Y-%m-%d %H:%M')}"


class EEGData(models.Model):
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='eeg_data')
    timestamp = models.FloatField()
    channel_data = models.TextField()
    attention_score = models.FloatField(default=0)
    band_powers = models.TextField()

    def set_channel_data(self, data):
        self.channel_data = json.dumps(data)

    def get_channel_data(self):
        return json.loads(self.channel_data)

    def set_band_powers(self, powers):
        self.band_powers = json.dumps(powers)

    def get_band_powers(self):
        return json.loads(self.band_powers)
