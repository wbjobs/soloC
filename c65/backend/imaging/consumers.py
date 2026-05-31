import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import CollaborationSession, Annotation, Study
from django.contrib.auth.models import User
import uuid


class OrderedMessageBuffer:
    def __init__(self, window_size=100):
        self.expected_sequence = 1
        self.buffer = {}
        self.window_size = window_size
        self.max_gap = 50

    def add(self, sequence, message):
        if sequence < self.expected_sequence:
            return None, False
        self.buffer[sequence] = message
        return self.process()

    def process(self):
        ordered_messages = []
        while self.expected_sequence in self.buffer:
            ordered_messages.append(self.buffer.pop(self.expected_sequence))
            self.expected_sequence += 1
        has_gap = len(self.buffer) > 0
        return ordered_messages, has_gap

    def skip_gap(self):
        if self.buffer:
            self.expected_sequence = min(self.buffer.keys())
            return self.process()
        return [], False


class CollaborationConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.session_id = None
        self.room_group_name = None
        self.user = None
        self.message_buffer = OrderedMessageBuffer(window_size=100)

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.room_group_name = f'collab_{self.session_id}'
        self.user = self.scope.get('user')

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

        await self.send(json.dumps({
            'type': 'connection_established',
            'session_id': self.session_id,
            'start_sequence': 1
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            sequence = data.get('sequence', 0)

            if message_type == 'annotation_update':
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'broadcast_message',
                        'message': data,
                        'sequence': sequence
                    }
                )
            elif message_type == 'request_resync':
                await self.handle_resync(data)
            elif message_type == 'heartbeat':
                await self.send(json.dumps({
                    'type': 'heartbeat_ack',
                    'timestamp': data.get('timestamp')
                }))

        except Exception as e:
            await self.send(json.dumps({
                'type': 'error',
                'message': str(e)
            }))

    async def broadcast_message(self, event):
        message = event['message']
        sequence = event.get('sequence', 0)

        ordered_messages, has_gap = self.message_buffer.add(sequence, message)

        for msg in ordered_messages:
            await self.send(json.dumps(msg))

        if has_gap:
            await self.send(json.dumps({
                'type': 'sequence_gap',
                'expected': self.message_buffer.expected_sequence,
                'buffered': len(self.message_buffer.buffer)
            }))

            await asyncio.sleep(0.5)
            skipped_messages, _ = self.message_buffer.skip_gap()
            for msg in skipped_messages:
                await self.send(json.dumps(msg))

    async def handle_resync(self, data):
        last_sequence = data.get('last_sequence', 0)
        self.message_buffer.expected_sequence = last_sequence + 1
        self.message_buffer.buffer.clear()

        await self.send(json.dumps({
            'type': 'resync_complete',
            'next_sequence': self.message_buffer.expected_sequence
        }))


class AnnotationConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.study_id = None
        self.room_group_name = None

    async def connect(self):
        self.study_id = self.scope['url_route']['kwargs']['study_id']
        self.room_group_name = f'study_{self.study_id}'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'annotation_message',
                'message': data
            }
        )

    async def annotation_message(self, event):
        message = event['message']
        await self.send(json.dumps(message))
