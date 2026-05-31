import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from asgiref.sync import sync_to_async
import numpy as np
from .signal_processing import RealTimeBuffer, EEGProcessor
from .models import Session, EEGData
from .sync_analysis import group_manager
import asyncio
import uuid


class EEGConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.participant_id = str(uuid.uuid4())
        self.session_id = None
        self.group_session_id = None
        self.buffer = RealTimeBuffer()
        self.attention_scores = []
        self.channel_layer = get_channel_layer()
        await self.accept()

    async def disconnect(self, close_code):
        if self.group_session_id:
            await self.leave_group_session()
        if self.session_id:
            await self.end_session()

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == 'start_session':
                await self.start_session(data)
            elif message_type == 'eeg_data':
                await self.process_eeg_data(data)
            elif message_type == 'end_session':
                await self.end_session()
            elif message_type == 'simulate':
                await self.simulate_eeg()
            elif message_type == 'create_group_session':
                await self.create_group_session(data)
            elif message_type == 'join_group_session':
                await self.join_group_session(data)
            elif message_type == 'leave_group_session':
                await self.leave_group_session()
            elif message_type == 'group_eeg_data':
                await self.process_group_eeg_data(data)

        except Exception as e:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': str(e)
            }))

    @database_sync_to_async
    def start_session_db(self, session_name):
        session = Session.objects.create(name=session_name)
        return session.id

    async def start_session(self, data):
        session_name = data.get('name', 'Untitled Session')
        self.session_id = await self.start_session_db(session_name)
        self.buffer = RealTimeBuffer()
        self.attention_scores = []
        await self.send(text_data=json.dumps({
            'type': 'session_started',
            'session_id': self.session_id
        }))

    @database_sync_to_async
    def save_eeg_data(self, timestamp, channel_data, attention_score, band_powers):
        session = Session.objects.get(id=self.session_id)
        eeg_data = EEGData(
            session=session,
            timestamp=timestamp,
            attention_score=attention_score
        )
        eeg_data.set_channel_data(channel_data)
        eeg_data.set_band_powers(band_powers)
        eeg_data.save()

    async def process_eeg_data(self, data):
        channel_data = data.get('channels', [0, 0, 0, 0])
        
        ready, band_powers, attention = self.buffer.add_sample(channel_data)
        
        if ready:
            self.attention_scores.append(attention)
            
            if self.session_id:
                await self.save_eeg_data(
                    self.buffer.timestamp,
                    channel_data,
                    attention,
                    band_powers
                )
            
            await self.send(text_data=json.dumps({
                'type': 'eeg_processed',
                'timestamp': self.buffer.timestamp,
                'band_powers': band_powers,
                'attention_score': attention,
                'raw_data': channel_data
            }))

    @database_sync_to_async
    def end_session_db(self):
        session = Session.objects.get(id=self.session_id)
        session.end_time = session.start_time
        session.duration = self.buffer.timestamp
        if self.attention_scores:
            session.average_attention = np.mean(self.attention_scores)
        session.save()
        return {
            'session_id': session.id,
            'duration': session.duration,
            'average_attention': session.average_attention
        }

    async def end_session(self):
        result = await self.end_session_db()
        await self.send(text_data=json.dumps({
            'type': 'session_ended',
            'result': result
        }))

    async def simulate_eeg(self):
        for i in range(1000):
            simulated_data = np.random.randn(4) * 10 + 50
            ready, band_powers, attention = self.buffer.add_sample(simulated_data.tolist())
            
            if ready:
                await self.send(text_data=json.dumps({
                    'type': 'eeg_processed',
                    'timestamp': self.buffer.timestamp,
                    'band_powers': band_powers,
                    'attention_score': attention,
                    'raw_data': simulated_data.tolist()
                }))
            
            await asyncio.sleep(0.01)

    @sync_to_async
    def create_group_session_sync(self, session_name):
        return group_manager.create_session(session_name)

    async def create_group_session(self, data):
        session_name = data.get('name', 'Group Session')
        participant_name = data.get('participant_name', 'Participant 1')
        
        self.group_session_id = await self.create_group_session_sync(session_name)
        
        group_session = group_manager.get_session(self.group_session_id)
        await sync_to_async(group_session.add_participant)(self.participant_id, participant_name)
        
        await self.channel_layer.group_add(
            f"group_{self.group_session_id}",
            self.channel_name
        )
        
        await self.send(text_data=json.dumps({
            'type': 'group_session_created',
            'group_session_id': self.group_session_id,
            'participant_id': self.participant_id
        }))

    async def join_group_session(self, data):
        group_session_id = data.get('group_session_id')
        participant_name = data.get('participant_name', 'Participant')
        
        group_session = group_manager.get_session(group_session_id)
        if not group_session:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Group session not found'
            }))
            return
        
        added = await sync_to_async(group_session.add_participant)(self.participant_id, participant_name)
        if not added:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Session is full'
            }))
            return
        
        self.group_session_id = group_session_id
        
        await self.channel_layer.group_add(
            f"group_{self.group_session_id}",
            self.channel_name
        )
        
        await self.channel_layer.group_send(
            f"group_{self.group_session_id}",
            {
                'type': 'participant_joined',
                'participant_id': self.participant_id,
                'participant_name': participant_name
            }
        )
        
        await self.send(text_data=json.dumps({
            'type': 'group_session_joined',
            'group_session_id': self.group_session_id,
            'participant_id': self.participant_id
        }))

    async def leave_group_session(self):
        if not self.group_session_id:
            return
        
        group_session = group_manager.get_session(self.group_session_id)
        if group_session:
            await sync_to_async(group_session.remove_participant)(self.participant_id)
        
        await self.channel_layer.group_discard(
            f"group_{self.group_session_id}",
            self.channel_name
        )
        
        await self.channel_layer.group_send(
            f"group_{self.group_session_id}",
            {
                'type': 'participant_left',
                'participant_id': self.participant_id
            }
        )
        
        self.group_session_id = None

    async def process_group_eeg_data(self, data):
        if not self.group_session_id:
            return
        
        channel_data = data.get('channels', [0, 0, 0, 0])
        attention_score = data.get('attention_score', 50)
        
        group_session = group_manager.get_session(self.group_session_id)
        if not group_session:
            return
        
        buffer_full = await sync_to_async(group_session.add_eeg_data)(self.participant_id, channel_data)
        await sync_to_async(group_session.update_attention)(self.participant_id, attention_score)
        
        if buffer_full:
            sync_metrics = await sync_to_async(group_session.compute_sync_metrics)()
            
            await self.channel_layer.group_send(
                f"group_{self.group_session_id}",
                {
                    'type': 'group_sync_update',
                    'metrics': sync_metrics,
                    'participant_id': self.participant_id,
                    'attention_score': attention_score
                }
            )

    async def participant_joined(self, event):
        await self.send(text_data=json.dumps({
            'type': 'participant_joined',
            'participant_id': event['participant_id'],
            'participant_name': event['participant_name']
        }))

    async def participant_left(self, event):
        await self.send(text_data=json.dumps({
            'type': 'participant_left',
            'participant_id': event['participant_id']
        }))

    async def group_sync_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'group_sync_update',
            'metrics': event['metrics'],
            'participant_id': event['participant_id'],
            'attention_score': event['attention_score']
        }))
