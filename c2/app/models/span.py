import uuid
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any


class Span(BaseModel):
    span_id: Optional[str] = None
    service_name: str
    operation: str
    parent_span_id: Optional[str] = ""
    timestamp: int
    duration: float
    metadata: Optional[Dict[str, Any]] = {}
    
    def model_post_init(self, __context):
        if self.span_id is None or self.span_id == "":
            self.span_id = str(uuid.uuid4())
