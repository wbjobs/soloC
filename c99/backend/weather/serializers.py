from rest_framework import serializers
from .models import WeatherRecord


class WeatherRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeatherRecord
        fields = '__all__'


class WeatherDataQuerySerializer(serializers.Serializer):
    location = serializers.CharField(required=False)
    data_source = serializers.CharField(required=False)
    start_time = serializers.DateTimeField(required=False)
    end_time = serializers.DateTimeField(required=False)
    metric = serializers.CharField(required=False, default='temperature')


class PredictionQuerySerializer(serializers.Serializer):
    location = serializers.CharField(required=True)
    days_ahead = serializers.IntegerField(required=False, default=7, min_value=1, max_value=30)
