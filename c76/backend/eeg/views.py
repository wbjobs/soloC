from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.utils import timezone
from datetime import timedelta
from .models import Session, EEGData
from .serializers import SessionSerializer, SessionListSerializer
import json


class SessionViewSet(viewsets.ModelViewSet):
    queryset = Session.objects.all()
    serializer_class = SessionSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return SessionListSerializer
        return SessionSerializer


@api_view(['GET'])
def session_compare(request):
    session_ids = request.query_params.getlist('ids')
    if len(session_ids) < 2:
        return Response(
            {'error': 'Need at least 2 session IDs'},
            status=status.HTTP_400_BAD_REQUEST
        )

    sessions = Session.objects.filter(id__in=session_ids)
    if len(sessions) < 2:
        return Response(
            {'error': 'Could not find all sessions'},
            status=status.HTTP_404_NOT_FOUND
        )

    result = []
    for session in sessions:
        eeg_data = list(session.eeg_data.all().values('timestamp', 'attention_score', 'band_powers'))
        for data in eeg_data:
            data['band_powers'] = json.loads(data['band_powers'])
        
        result.append({
            'session_id': session.id,
            'name': session.name,
            'start_time': session.start_time,
            'duration': session.duration,
            'average_attention': session.average_attention,
            'data': eeg_data
        })

    return Response(result)


@api_view(['POST'])
def sync_offline_data(request):
    session_id = request.data.get('session_id')
    offline_data = request.data.get('offline_data', [])

    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        return Response(
            {'error': 'Session not found'},
            status=status.HTTP_404_NOT_FOUND
        )

    synced_count = 0
    for data_point in offline_data:
        try:
            eeg_data = EEGData(
                session=session,
                timestamp=data_point.get('timestamp', 0),
                attention_score=data_point.get('attention_score', 0)
            )
            eeg_data.set_channel_data(data_point.get('raw_data', [0, 0, 0, 0]))
            eeg_data.set_band_powers(data_point.get('band_powers', {}))
            eeg_data.save()
            synced_count += 1
        except Exception as e:
            continue

    return Response({
        'synced_count': synced_count,
        'total': len(offline_data)
    })


@api_view(['POST'])
def resume_session(request):
    session_id = request.data.get('session_id')
    
    try:
        session = Session.objects.get(id=session_id)
        session.end_time = None
        session.save()
        
        return Response({
            'session_id': session.id,
            'name': session.name,
            'resumed': True
        })
    except Session.DoesNotExist:
        return Response(
            {'error': 'Session not found'},
            status=status.HTTP_404_NOT_FOUND
        )
