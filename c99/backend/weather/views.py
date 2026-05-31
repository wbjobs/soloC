import pandas as pd
from django.db.models import Q, Avg, Min, Max, StdDev, Count
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import WeatherRecord
from .serializers import (
    WeatherRecordSerializer,
    WeatherDataQuerySerializer,
    PredictionQuerySerializer
)
from ..data_analysis import DataFusionAnalyzer


class WeatherViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WeatherRecord.objects.all()
    serializer_class = WeatherRecordSerializer

    @action(detail=False, methods=['get'])
    def latest(self, request):
        location = request.query_params.get('location')
        deduplicate = request.query_params.get('deduplicate', 'true').lower() == 'true'
        queryset = self.queryset

        if location:
            queryset = queryset.filter(location=location)

        if deduplicate:
            from django.db.models import Max
            latest_ids = queryset.values('location', 'data_source').annotate(
                max_id=Max('id')
            ).values_list('max_id', flat=True)
            queryset = WeatherRecord.objects.filter(id__in=latest_ids)

        latest_records = queryset.order_by('-timestamp')[:50]
        serializer = self.get_serializer(latest_records, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_location(self, request):
        location = request.query_params.get('location')
        start_time = request.query_params.get('start_time')
        end_time = request.query_params.get('end_time')
        deduplicate = request.query_params.get('deduplicate', 'true').lower() == 'true'

        if not location:
            return Response(
                {'error': 'location parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = WeatherRecord.objects.filter(location=location)

        if start_time:
            queryset = queryset.filter(timestamp__gte=start_time)
        if end_time:
            queryset = queryset.filter(timestamp__lte=end_time)

        if deduplicate:
            from django.db.models import Max
            latest_records = queryset.values('timestamp', 'data_source').annotate(
                max_id=Max('id')
            ).values_list('max_id', flat=True)
            queryset = WeatherRecord.objects.filter(id__in=latest_records)

        records = queryset.order_by('-timestamp')[:100]
        serializer = self.get_serializer(records, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def compare_sources(self, request):
        serializer = WeatherDataQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        location = serializer.validated_data.get('location')
        metric = serializer.validated_data.get('metric', 'temperature')

        queryset = WeatherRecord.objects.exclude(**{f'{metric}__isnull': True})

        if location:
            queryset = queryset.filter(location=location)

        data = list(queryset.values('data_source', metric, 'location', 'timestamp'))
        if not data:
            return Response({'error': 'No data available'})

        analyzer = DataFusionAnalyzer()
        comparison = analyzer.compare_data_sources(data, metric)

        return Response({
            'metric': metric,
            'location': location,
            'comparison': comparison
        })

    @action(detail=False, methods=['get'])
    def fused_data(self, request):
        location = request.query_params.get('location')

        queryset = WeatherRecord.objects.all()
        if location:
            queryset = queryset.filter(location=location)

        records = queryset.order_by('-timestamp')[:100]
        data = list(records.values())

        if not data:
            return Response({'error': 'No data available'})

        analyzer = DataFusionAnalyzer()
        fused = analyzer.fuse_data(data)

        return Response({
            'location': location,
            'fused_data': fused,
            'record_count': len(data)
        })

    @action(detail=False, methods=['get'])
    def predict(self, request):
        serializer = PredictionQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        location = serializer.validated_data['location']
        days_ahead = serializer.validated_data.get('days_ahead', 7)

        records = WeatherRecord.objects.filter(location=location).order_by('timestamp')
        data = list(records.values())

        if len(data) < 14:
            return Response(
                {'error': f'Insufficient historical data for prediction, need at least 14 records, got {len(data)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        analyzer = DataFusionAnalyzer()
        result = analyzer.predict_trend(data, days_ahead)

        if 'error' in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'location': location,
            'days_ahead': days_ahead,
            **result
        })

    @action(detail=False, methods=['get'])
    def prediction_summary(self, request):
        location = request.query_params.get('location')
        days_ahead = int(request.query_params.get('days_ahead', 7))

        if not location:
            return Response(
                {'error': 'location parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        records = WeatherRecord.objects.filter(location=location).order_by('timestamp')
        data = list(records.values())

        if len(data) < 14:
            return Response(
                {'error': f'Insufficient historical data, need at least 14 records, got {len(data)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        analyzer = DataFusionAnalyzer()
        summary = analyzer.get_prediction_summary(data, days_ahead)

        return Response({
            'location': location,
            **summary
        })

    @action(detail=False, methods=['get'])
    def alerts(self, request):
        location = request.query_params.get('location')

        queryset = WeatherRecord.objects.order_by('-timestamp')[:100]
        if location:
            queryset = queryset.filter(location=location)

        data = list(queryset.values())

        if not data:
            return Response({'alerts': []})

        analyzer = DataFusionAnalyzer()
        alerts = analyzer.detect_extreme_weather(data)

        return Response({'alerts': alerts})

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        location = request.query_params.get('location')
        data_source = request.query_params.get('data_source')

        queryset = WeatherRecord.objects.all()

        if location:
            queryset = queryset.filter(location=location)
        if data_source:
            queryset = queryset.filter(data_source=data_source)

        data = list(queryset.values())

        if not data:
            return Response({'error': 'No data available'})

        analyzer = DataFusionAnalyzer()
        stats = analyzer.generate_statistics(data)

        return Response(stats)

    @action(detail=False, methods=['get'])
    def export(self, request):
        location = request.query_params.get('location')
        data_source = request.query_params.get('data_source')
        start_time = request.query_params.get('start_time')
        end_time = request.query_params.get('end_time')
        format_type = request.query_params.get('format', 'csv').lower()

        if format_type not in ['csv', 'excel']:
            return Response(
                {'error': 'Unsupported format. Use "csv" or "excel"'},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = WeatherRecord.objects.all()

        if location:
            queryset = queryset.filter(location=location)
        if data_source:
            queryset = queryset.filter(data_source=data_source)
        if start_time:
            queryset = queryset.filter(timestamp__gte=start_time)
        if end_time:
            queryset = queryset.filter(timestamp__lte=end_time)

        data = list(queryset.values())

        if not data:
            return Response({'error': 'No data available for export'}, status=status.HTTP_404_NOT_FOUND)

        try:
            analyzer = DataFusionAnalyzer()
            filename, content = analyzer.export_data(data, format_type)

            if format_type == 'csv':
                return Response({
                    'filename': filename,
                    'content': content,
                    'format': format_type,
                    'record_count': len(data)
                })
            else:
                import base64
                return Response({
                    'filename': filename,
                    'content': base64.b64encode(content).decode('utf-8'),
                    'format': format_type,
                    'record_count': len(data)
                })
        except Exception as e:
            return Response(
                {'error': f'Export failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def locations(self, request):
        from django.db.models import Max
        locations = WeatherRecord.objects.values('location').annotate(
            latest_id=Max('id'),
            latitude=Max('latitude'),
            longitude=Max('longitude')
        ).values('location', 'latitude', 'longitude')
        return Response({'locations': list(locations)})

    @action(detail=False, methods=['get'])
    def data_sources(self, request):
        sources = WeatherRecord.objects.values_list('data_source', flat=True).distinct()
        return Response({'data_sources': list(sources)})

    @action(detail=False, methods=['get'])
    def time_series(self, request):
        location = request.query_params.get('location')
        metric = request.query_params.get('metric', 'temperature')
        data_source = request.query_params.get('data_source')
        aggregate = request.query_params.get('aggregate', 'true').lower() == 'true'

        if not location:
            return Response(
                {'error': 'location parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = WeatherRecord.objects.filter(location=location)

        if data_source:
            queryset = queryset.filter(data_source=data_source)

        records = queryset.order_by('timestamp')[:500]

        if aggregate:
            from collections import defaultdict
            aggregated = defaultdict(list)
            for record in records:
                ts_key = record.timestamp.replace(minute=0, second=0, microsecond=0).isoformat()
                value = getattr(record, metric, None)
                if value is not None:
                    aggregated[ts_key].append(value)

            data = []
            for ts, values in sorted(aggregated.items()):
                avg_value = sum(values) / len(values)
                data.append({
                    'timestamp': ts,
                    'value': round(avg_value, 2),
                    'count': len(values)
                })
        else:
            data = []
            for record in records:
                value = getattr(record, metric, None)
                if value is not None:
                    data.append({
                        'timestamp': record.timestamp.isoformat(),
                        'value': value,
                        'data_source': record.data_source
                    })

        return Response({
            'location': location,
            'metric': metric,
            'data': data
        })
