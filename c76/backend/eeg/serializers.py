from rest_framework import serializers
from .models import Session, EEGData


class EEGDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = EEGData
        fields = ['timestamp', 'attention_score', 'band_powers', 'channel_data']


class SessionSerializer(serializers.ModelSerializer):
    eeg_data = EEGDataSerializer(many=True, read_only=True)
    
    class Meta:
        model = Session
        fields = ['id', 'name', 'start_time', 'end_time', 
                 'duration', 'average_attention', 'notes', 'eeg_data']


class SessionListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Session
        fields = ['id', 'name', 'start_time', 'duration', 'average_attention']
