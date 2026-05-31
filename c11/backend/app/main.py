import asyncio
import json
import uuid
import os
import gc
import time
from pathlib import Path
from typing import List, Dict, Optional, Any
from collections import OrderedDict
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .audio_loader import AudioLoader
from .fft_processor import FftProcessor
from .pdf_generator import generate_pdf_report, load_spectrums_from_json

UPLOAD_DIR = Path("uploads")
SPECTRUM_DIR = Path("spectrums")
UPLOAD_DIR.mkdir(exist_ok=True)
SPECTRUM_DIR.mkdir(exist_ok=True)

MAX_SESSIONS = 10
SESSION_TIMEOUT_SECONDS = 3600

app = FastAPI(title="音频频谱分析系统")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalysisConfig(BaseModel):
    fft_size: int = 1024
    hop_size: int = 512


class SessionManager:
    def __init__(self, max_sessions: int = MAX_SESSIONS):
        self.max_sessions = max_sessions
        self._sessions: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._lock = asyncio.Lock()
    
    async def add_session(self, session_id: str, session_data: Dict[str, Any]):
        async with self._lock:
            if len(self._sessions) >= self.max_sessions:
                oldest_id, oldest_data = next(iter(self._sessions.items()))
                await self._cleanup_session(oldest_id, oldest_data)
                del self._sessions[oldest_id]
            
            self._sessions[session_id] = {
                **session_data,
                "created_at": time.time(),
                "last_accessed": time.time()
            }
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        async with self._lock:
            if session_id in self._sessions:
                self._sessions.move_to_end(session_id)
                self._sessions[session_id]["last_accessed"] = time.time()
                return self._sessions[session_id]
            return None
    
    async def remove_session(self, session_id: str):
        async with self._lock:
            if session_id in self._sessions:
                await self._cleanup_session(session_id, self._sessions[session_id])
                del self._sessions[session_id]
    
    async def _cleanup_session(self, session_id: str, session_data: Dict[str, Any]):
        file_path = session_data.get("file_path")
        if file_path and file_path.exists():
            try:
                file_path.unlink()
            except Exception as e:
                print(f"[清理] 删除音频文件失败: {e}")
        
        if "audio_data" in session_data:
            session_data["audio_data"] = None
        
        spectrum_file = SPECTRUM_DIR / f"{session_id}.json"
        if spectrum_file.exists():
            try:
                spectrum_file.unlink()
            except Exception as e:
                print(f"[清理] 删除频谱文件失败: {e}")
    
    async def cleanup_expired(self, timeout_seconds: int = SESSION_TIMEOUT_SECONDS):
        current_time = time.time()
        expired_ids = []
        
        async with self._lock:
            for session_id, data in self._sessions.items():
                if current_time - data.get("last_accessed", 0) > timeout_seconds:
                    expired_ids.append(session_id)
            
            for session_id in expired_ids:
                await self._cleanup_session(session_id, self._sessions[session_id])
                del self._sessions[session_id]
        
        if expired_ids:
            gc.collect()
            print(f"[清理] 已清理 {len(expired_ids)} 个过期会话")
    
    def list_sessions(self) -> List[Dict]:
        return [
            {
                "session_id": sid,
                "filename": data.get("filename"),
                "duration": data.get("duration"),
                "created_at": data.get("created_at")
            }
            for sid, data in self._sessions.items()
        ]
    
    def __contains__(self, session_id: str) -> bool:
        return session_id in self._sessions


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        async with self._lock:
            self.active_connections[session_id] = websocket
    
    async def disconnect(self, session_id: str):
        async with self._lock:
            if session_id in self.active_connections:
                try:
                    ws = self.active_connections[session_id]
                    ws.on_event = None
                    del self.active_connections[session_id]
                except Exception:
                    pass
    
    async def send_message(self, session_id: str, message: dict):
        async with self._lock:
            if session_id in self.active_connections:
                try:
                    await self.active_connections[session_id].send_json(message)
                except Exception as e:
                    print(f"[WebSocket] 发送消息失败: {e}")


session_manager = SessionManager(max_sessions=MAX_SESSIONS)
connection_manager = ConnectionManager()
cleanup_task = None


@app.on_event("startup")
async def startup_event():
    global cleanup_task
    
    async def periodic_cleanup():
        while True:
            try:
                await asyncio.sleep(300)
                await session_manager.cleanup_expired(SESSION_TIMEOUT_SECONDS)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[清理任务] 错误: {e}")
    
    cleanup_task = asyncio.create_task(periodic_cleanup())


@app.on_event("shutdown")
async def shutdown_event():
    if cleanup_task:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass


@app.get("/")
async def root():
    return {
        "message": "音频频谱分析系统API", 
        "version": "2.0.0",
        "features": [
            "WAV/MP3 音频上传",
            "WebSocket 实时频谱分析",
            "3D 可视化支持",
            "JSON 数据导出",
            "会话自动清理"
        ]
    }


@app.post("/upload")
async def upload_audio(file: UploadFile = File(...)):
    allowed_exts = [".wav", ".mp3"]
    
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="只支持WAV和MP3格式")
    
    session_id = str(uuid.uuid4())
    file_bytes = await file.read()
    file_path = UPLOAD_DIR / f"{session_id}{ext}"
    
    try:
        with open(file_path, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存文件失败: {str(e)}")
    
    try:
        file_type = "wav" if ext == ".wav" else "mp3"
        audio_data, sample_rate = AudioLoader.load_audio_from_bytes(file_bytes, file_type)
    except Exception as e:
        if file_path.exists():
            file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"无法解析音频文件: {str(e)}")
    
    audio_info = {
        "file_path": file_path,
        "audio_data": audio_data,
        "sample_rate": sample_rate,
        "filename": file.filename,
        "duration": len(audio_data) / sample_rate
    }
    
    await session_manager.add_session(session_id, audio_info)
    
    del audio_data
    del file_bytes
    gc.collect()
    
    return {
        "session_id": session_id,
        "filename": file.filename,
        "sample_rate": sample_rate,
        "duration": len(audio_info["audio_data"]) / sample_rate if audio_info.get("audio_data") is not None else 0,
        "num_samples": len(audio_info["audio_data"]) if audio_info.get("audio_data") is not None else 0
    }


@app.websocket("/ws/analyze/{session_id}")
async def websocket_analyze(websocket: WebSocket, session_id: str):
    await connection_manager.connect(websocket, session_id)
    
    session = await session_manager.get_session(session_id)
    
    if not session:
        try:
            await websocket.send_json({"type": "error", "message": "会话不存在或已过期"})
        except Exception:
            pass
        await connection_manager.disconnect(session_id)
        return
    
    all_spectrums = []
    processor = None
    audio_data_ref = None
    
    try:
        audio_data = session.get("audio_data")
        sample_rate = session.get("sample_rate", 44100)
        
        if audio_data is None:
            await websocket.send_json({"type": "error", "message": "音频数据已释放"})
            await connection_manager.disconnect(session_id)
            return
        
        audio_data_ref = audio_data
        
        await websocket.send_json({
            "type": "ready",
            "sample_rate": sample_rate,
            "duration": session.get("duration", 0)
        })
        
        data = await websocket.receive_json()
        config = data.get("config", {})
        fft_size = config.get("fft_size", 1024)
        hop_size = config.get("hop_size", 512)
        
        processor = FftProcessor(fft_size=fft_size)
        
        total_frames = (len(audio_data) - fft_size) // hop_size + 1
        
        await websocket.send_json({
            "type": "start",
            "total_frames": total_frames
        })
        
        spectrum_batch = []
        batch_size = 100
        
        for spectrum, frame_idx in processor.process_audio_stream(
            audio_data, sample_rate, hop_size
        ):
            spectrum_batch.append(spectrum)
            
            if len(spectrum_batch) >= batch_size:
                all_spectrums.extend(spectrum_batch)
                spectrum_batch = []
            
            try:
                await websocket.send_json({
                    "type": "spectrum",
                    "frame": frame_idx,
                    "total": total_frames,
                    "data": spectrum
                })
            except Exception:
                break
            
            await asyncio.sleep(0.001)
        
        if spectrum_batch:
            all_spectrums.extend(spectrum_batch)
        
        output_file = SPECTRUM_DIR / f"{session_id}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump({
                "session_id": session_id,
                "filename": session.get("filename"),
                "sample_rate": sample_rate,
                "fft_size": fft_size,
                "hop_size": hop_size,
                "spectrums": all_spectrums
            }, f, ensure_ascii=False)
        
        await websocket.send_json({
            "type": "complete",
            "total_frames": len(all_spectrums),
            "download_url": f"/api/spectrum/{session_id}"
        })
        
    except WebSocketDisconnect:
        print(f"[WebSocket] 客户端断开连接: {session_id}")
    except Exception as e:
        print(f"[WebSocket] 错误: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except Exception:
            pass
    finally:
        del all_spectrums
        if processor:
            del processor
        audio_data_ref = None
        gc.collect()
        await connection_manager.disconnect(session_id)


@app.get("/api/spectrum/{session_id}")
async def download_spectrum(session_id: str):
    spectrum_file = SPECTRUM_DIR / f"{session_id}.json"
    
    if not spectrum_file.exists():
        raise HTTPException(status_code=404, detail="频谱数据不存在或已过期")
    
    session = await session_manager.get_session(session_id)
    
    if session:
        filename = Path(session.get("filename", "audio")).stem + "_spectrum.json"
    else:
        filename = f"{session_id}_spectrum.json"
    
    return FileResponse(
        path=str(spectrum_file),
        media_type="application/json",
        filename=filename
    )


@app.get("/api/sessions")
async def list_sessions():
    return {
        "sessions": session_manager.list_sessions()
    }


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    await session_manager.remove_session(session_id)
    gc.collect()
    return {"message": "会话已删除"}


@app.post("/api/cleanup")
async def manual_cleanup():
    await session_manager.cleanup_expired(0)
    gc.collect()
    return {"message": "清理完成"}


@app.get("/api/report/{session_id}")
async def generate_report(session_id: str):
    spectrum_file = SPECTRUM_DIR / f"{session_id}.json"
    
    if not spectrum_file.exists():
        raise HTTPException(status_code=404, detail="频谱数据不存在或已过期")
    
    try:
        import json
        with open(spectrum_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        spectrums = data.get('spectrums', [])
        filename = data.get('filename', 'audio')
        sample_rate = data.get('sample_rate', 44100)
        fft_size = data.get('fft_size', 1024)
        hop_size = data.get('hop_size', 512)
        
        if not spectrums:
            raise HTTPException(status_code=400, detail="频谱数据为空")
        
        pdf_path = generate_pdf_report(
            session_id=session_id,
            filename=filename,
            spectrums=spectrums,
            sample_rate=sample_rate,
            fft_size=fft_size,
            hop_size=hop_size
        )
        
        if not pdf_path:
            raise HTTPException(status_code=500, detail="PDF生成失败")
        
        output_filename = f"{Path(filename).stem}_spectrum_report.pdf"
        
        return FileResponse(
            path=str(pdf_path),
            media_type="application/pdf",
            filename=output_filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[PDF] API错误: {e}")
        raise HTTPException(status_code=500, detail=f"生成报告失败: {str(e)}")


@app.get("/api/report/status/{session_id}")
async def check_report_status(session_id: str):
    spectrum_file = SPECTRUM_DIR / f"{session_id}.json"
    
    return {
        "spectrum_exists": spectrum_file.exists(),
        "session_id": session_id
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
