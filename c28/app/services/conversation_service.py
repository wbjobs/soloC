import uuid
import json
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
from dataclasses import dataclass, asdict, field

from app.config import settings
from app.models.schemas import ChatMessage


@dataclass
class Conversation:
    id: str
    messages: List[Dict[str, str]] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


class ConversationService:
    def __init__(self):
        self.conversations_dir = settings.DATA_DIR / "conversations"
        self.conversations_dir.mkdir(parents=True, exist_ok=True)
        self._cache: Dict[str, Conversation] = {}
    
    def _get_file_path(self, conversation_id: str) -> Path:
        return self.conversations_dir / f"{conversation_id}.json"
    
    def _load_from_file(self, conversation_id: str) -> Optional[Conversation]:
        file_path = self._get_file_path(conversation_id)
        if file_path.exists():
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return Conversation(
                        id=data["id"],
                        messages=data["messages"],
                        created_at=data["created_at"],
                        updated_at=data["updated_at"],
                    )
            except Exception:
                pass
        return None
    
    def _save_to_file(self, conversation: Conversation) -> None:
        file_path = self._get_file_path(conversation.id)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(asdict(conversation), f, ensure_ascii=False, indent=2)
    
    def create_conversation(self) -> Conversation:
        conv_id = str(uuid.uuid4())
        conv = Conversation(id=conv_id)
        self._cache[conv_id] = conv
        self._save_to_file(conv)
        return conv
    
    def get_conversation(self, conversation_id: Optional[str]) -> Conversation:
        if conversation_id:
            if conversation_id in self._cache:
                return self._cache[conversation_id]
            conv = self._load_from_file(conversation_id)
            if conv:
                self._cache[conversation_id] = conv
                return conv
        return self.create_conversation()
    
    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
    ) -> Conversation:
        conv = self.get_conversation(conversation_id)
        conv.messages.append({"role": role, "content": content})
        conv.updated_at = datetime.now().isoformat()
        
        if len(conv.messages) > settings.MAX_HISTORY * 2:
            conv.messages = conv.messages[-settings.MAX_HISTORY * 2:]
        
        self._cache[conv.id] = conv
        self._save_to_file(conv)
        return conv
    
    def get_messages(
        self,
        conversation_id: str,
        limit: int = None,
    ) -> List[Dict[str, str]]:
        conv = self.get_conversation(conversation_id)
        if limit:
            return conv.messages[-limit * 2:]
        return conv.messages
    
    def format_history(
        self,
        conversation_id: str,
        max_turns: int = None,
    ) -> List[Dict[str, str]]:
        max_turns = max_turns or settings.MAX_HISTORY
        messages = self.get_messages(conversation_id, max_turns)
        return [
            {"role": msg["role"], "content": msg["content"]}
            for msg in messages
        ]
    
    def list_conversations(self) -> List[Dict[str, Any]]:
        convs = []
        for file_path in self.conversations_dir.glob("*.json"):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    convs.append({
                        "id": data["id"],
                        "message_count": len(data["messages"]),
                        "created_at": data["created_at"],
                        "updated_at": data["updated_at"],
                    })
            except Exception:
                pass
        return sorted(convs, key=lambda x: x["updated_at"], reverse=True)
    
    def delete_conversation(self, conversation_id: str) -> bool:
        file_path = self._get_file_path(conversation_id)
        if conversation_id in self._cache:
            del self._cache[conversation_id]
        if file_path.exists():
            file_path.unlink()
            return True
        return False
