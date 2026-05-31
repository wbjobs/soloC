from django.db import models


class WeatherRecord(models.Model):
    timestamp = models.DateTimeField(db_index=True)
    location = models.CharField(max_length=100, db_index=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    temperature = models.FloatField(null=True, blank=True)
    humidity = models.FloatField(null=True, blank=True)
    pressure = models.FloatField(null=True, blank=True)
    wind_speed = models.FloatField(null=True, blank=True)
    wind_direction = models.FloatField(null=True, blank=True)
    precipitation = models.FloatField(null=True, blank=True)
    data_source = models.CharField(max_length=50, db_index=True)
    quality_score = models.FloatField(default=1.0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'weather_records'
        indexes = [
            models.Index(fields=['location', 'timestamp']),
            models.Index(fields=['data_source', 'timestamp']),
        ]

    def __str__(self):
        return f"{self.location} - {self.timestamp} - {self.data_source}"
