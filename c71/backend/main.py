from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
import io
import json

from database import get_db, engine, Base
from models import Composition
from simple_music_generator import midi_to_bytes

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MIDI Music Accompaniment Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MelodyNote(BaseModel):
    pitch: str
    duration: float
    velocity: Optional[int] = 100

class GenerateRequest(BaseModel):
    melody: List[MelodyNote]
    style: str = "pop"
    title: Optional[str] = "Untitled"

@app.post("/api/generate")
async def generate_accompaniment(
    request: GenerateRequest,
    db: Session = Depends(get_db)
):
    try:
        melody_notes = [n.dict() for n in request.melody]
        melody_midi, accompaniment_midi = midi_to_bytes(melody_notes, request.style)
        
        composition = Composition(
            title=request.title,
            style=request.style,
            melody_data=melody_midi,
            accompaniment_data=accompaniment_midi
        )
        db.add(composition)
        db.commit()
        db.refresh(composition)
        
        return {
            "id": composition.id,
            "title": composition.title,
            "style": composition.style,
            "created_at": composition.created_at.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/compositions")
async def get_compositions(db: Session = Depends(get_db)):
    compositions = db.query(Composition).order_by(Composition.created_at.desc()).all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "style": c.style,
            "created_at": c.created_at.isoformat()
        }
        for c in compositions
    ]

@app.get("/api/compositions/{composition_id}/download")
async def download_midi(
    composition_id: int,
    type: str = "accompaniment",
    db: Session = Depends(get_db)
):
    composition = db.query(Composition).filter(Composition.id == composition_id).first()
    if not composition:
        raise HTTPException(status_code=404, detail="Composition not found")
    
    midi_data = composition.accompaniment_data if type == "accompaniment" else composition.melody_data
    filename = f"{composition.title}_{type}.mid"
    
    return Response(
        content=midi_data,
        media_type="audio/midi",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.delete("/api/compositions/{composition_id}")
async def delete_composition(composition_id: int, db: Session = Depends(get_db)):
    composition = db.query(Composition).filter(Composition.id == composition_id).first()
    if not composition:
        raise HTTPException(status_code=404, detail="Composition not found")
    
    db.delete(composition)
    db.commit()
    return {"message": "Composition deleted successfully"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
