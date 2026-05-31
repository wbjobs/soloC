from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
from datetime import datetime
import json
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'ai_models'))

from database import get_db, init_db, UploadedImage, OCRResult, RestorationTask, User, AuditLog
from ocr_engine import OCREngine
from restoration_engine import RestorationEngine
from task_scheduler import get_scheduler
from image_utils import generate_thumbnail
from text_completion import AncientTextCompleter

app = FastAPI(title="多模态古籍文字识别与修复系统")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("../uploads", exist_ok=True)
os.makedirs("../outputs", exist_ok=True)
os.makedirs("../uploads/thumbs", exist_ok=True)

app.mount("/uploads", StaticFiles(directory="../uploads"), name="uploads")
app.mount("/outputs", StaticFiles(directory="../outputs"), name="outputs")

ocr_engine = OCREngine()
restoration_engine = RestorationEngine()
text_completer = AncientTextCompleter()
scheduler = None


@app.on_event("startup")
async def startup_event():
    global scheduler
    init_db()
    scheduler = get_scheduler()


@app.post("/api/upload")
async def upload_image(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    results = []
    for file in files:
        timestamp = datetime.now().timestamp()
        file_path = f"../uploads/{timestamp}_{file.filename}"
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        thumb_filename = f"thumb_{timestamp}_{os.path.splitext(file.filename)[0]}.jpg"
        thumb_path = f"../uploads/thumbs/{thumb_filename}"
        generate_thumbnail(file_path, thumb_path, max_size=300)
        
        db_image = UploadedImage(
            filename=file.filename,
            original_path=file_path,
            status="uploaded"
        )
        db.add(db_image)
        db.commit()
        db.refresh(db_image)
        
        results.append({
            "id": db_image.id,
            "filename": db_image.filename,
            "path": file_path,
            "url": f"/uploads/{os.path.basename(file_path)}",
            "thumb_url": f"/uploads/thumbs/{thumb_filename}"
        })
    
    return {"success": True, "data": results}


@app.get("/api/images")
async def get_images(db: Session = Depends(get_db)):
    images = db.query(UploadedImage).order_by(UploadedImage.upload_time.desc()).all()
    result = []
    for img in images:
        filename = os.path.basename(img.original_path)
        base_name = os.path.splitext(filename)[0]
        thumb_name = f"thumb_{base_name}.jpg"
        result.append({
            "id": img.id,
            "filename": img.filename,
            "url": f"/uploads/{filename}",
            "thumb_url": f"/uploads/thumbs/{thumb_name}",
            "status": img.status,
            "upload_time": img.upload_time.isoformat()
        })
    return {"success": True, "data": result}


@app.post("/api/ocr/{image_id}")
async def perform_ocr(
    image_id: int,
    region: Optional[str] = None,
    db: Session = Depends(get_db)
):
    image = db.query(UploadedImage).filter(UploadedImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    try:
        region_data = json.loads(region) if region else None
        result = ocr_engine.recognize(image.original_path, region=region_data)
        
        db_result = OCRResult(
            image_id=image_id,
            text_content=result["text"],
            confidence=result["confidence"],
            bounding_boxes=json.dumps(result["boxes"])
        )
        db.add(db_result)
        image.status = "ocr_completed"
        db.commit()
        
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ocr/{image_id}")
async def get_ocr_result(image_id: int, db: Session = Depends(get_db)):
    result = db.query(OCRResult).filter(OCRResult.image_id == image_id).first()
    if not result:
        return {"success": False, "data": None}
    
    return {
        "success": True,
        "data": {
            "text": result.text_content,
            "confidence": result.confidence,
            "boxes": json.loads(result.bounding_boxes) if result.bounding_boxes else []
        }
    }


@app.post("/api/export")
async def export_results(
    image_ids: List[int],
    format: str = "txt",
    db: Session = Depends(get_db)
):
    results = []
    for image_id in image_ids:
        ocr_result = db.query(OCRResult).filter(OCRResult.image_id == image_id).first()
        if ocr_result:
            results.append({
                "image_id": image_id,
                "text": ocr_result.text_content
            })
    
    if format == "txt":
        output_path = f"../outputs/export_{datetime.now().timestamp()}.txt"
        with open(output_path, "w", encoding="utf-8") as f:
            for r in results:
                f.write(f"=== Image {r['image_id']} ===\n")
                f.write(r["text"])
                f.write("\n\n")
    else:
        output_path = f"../outputs/export_{datetime.now().timestamp()}.md"
        with open(output_path, "w", encoding="utf-8") as f:
            for r in results:
                f.write(f"# Image {r['image_id']}\n\n")
                f.write(r["text"])
                f.write("\n\n---\n\n")
    
    return {"success": True, "download_url": f"/outputs/{os.path.basename(output_path)}"}


@app.post("/api/restore/{image_id}")
async def start_restoration(
    image_id: int,
    task_type: str = "denoise",
    db: Session = Depends(get_db)
):
    global scheduler
    image = db.query(UploadedImage).filter(UploadedImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    pending = db.query(RestorationTask).filter(
        RestorationTask.image_id == image_id,
        RestorationTask.status.in_(["pending", "processing"])
    ).first()
    if pending:
        return {"success": False, "message": "该图片已有任务在处理中，请等待完成", "task_id": pending.id}
    
    task = RestorationTask(
        image_id=image_id,
        task_type=task_type,
        status="pending",
        progress=0
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    
    if scheduler:
        scheduler.add_task(task.id, image.original_path, task_type, db)
    
    return {"success": True, "task_id": task.id, "message": "任务已加入队列"}


@app.get("/api/restore/queue/status")
async def get_queue_status():
    global scheduler
    if scheduler:
        return {"success": True, "data": scheduler.get_queue_status()}
    return {"success": False, "message": "调度器未初始化"}


@app.get("/api/restore/{task_id}")
async def get_restoration_status(task_id: int, db: Session = Depends(get_db)):
    task = db.query(RestorationTask).filter(RestorationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {
        "success": True,
        "data": {
            "id": task.id,
            "status": task.status,
            "progress": task.progress,
            "result_url": f"/outputs/{os.path.basename(task.result_path)}" if task.result_path else None
        }
    }


@app.post("/api/text/complete")
async def complete_text(
    text: str = Body(...),
    cursor_position: Optional[int] = Body(None),
    max_candidates: int = Body(5)
):
    candidates = text_completer.complete_text(text, cursor_position, max_candidates)
    return {"success": True, "data": candidates}


@app.post("/api/text/repair")
async def repair_missing_chars(
    text_with_holes: str = Body(...),
    hole_char: str = Body("□")
):
    results = text_completer.repair_missing_chars(text_with_holes, hole_char)
    return {"success": True, "data": results}


import hashlib


@app.post("/api/auth/login")
async def login(
    username: str = Body(...),
    password: str = Body(...),
    db: Session = Depends(get_db)
):
    password_hash = hashlib.md5(password.encode()).hexdigest()
    user = db.query(User).filter(
        User.username == username,
        User.password_hash == password_hash
    ).first()
    
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已被禁用")
    
    user.last_login = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "data": {
            "user_id": user.id,
            "username": user.username,
            "role": user.role,
            "email": user.email
        }
    }


@app.get("/api/users")
async def get_users(
    role: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    users = query.all()
    return {
        "success": True,
        "data": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "is_active": u.is_active,
                "created_time": u.created_time.isoformat(),
                "last_login": u.last_login.isoformat() if u.last_login else None
            }
            for u in users
        ]
    }


@app.get("/api/audit/pending")
async def get_pending_audit(
    db: Session = Depends(get_db)
):
    images = db.query(UploadedImage).filter(
        UploadedImage.audit_status == "pending"
    ).order_by(UploadedImage.upload_time.desc()).all()
    
    return {
        "success": True,
        "data": [
            {
                "id": img.id,
                "filename": img.filename,
                "url": f"/uploads/{os.path.basename(img.original_path)}",
                "upload_time": img.upload_time.isoformat(),
                "audit_status": img.audit_status
            }
            for img in images
        ]
    }


@app.post("/api/audit/{image_id}")
async def audit_image(
    image_id: int,
    action: str = Body(...),  # approve, reject
    comment: str = Body(""),
    admin_id: int = Body(1),
    db: Session = Depends(get_db)
):
    image = db.query(UploadedImage).filter(UploadedImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    image.audit_status = "approved" if action == "approve" else "rejected"
    image.audit_by = admin_id
    image.audit_time = datetime.utcnow()
    image.audit_comment = comment
    
    audit_log = AuditLog(
        image_id=image_id,
        admin_id=admin_id,
        action=action,
        comment=comment
    )
    db.add(audit_log)
    db.commit()
    
    return {"success": True, "message": "审核完成"}


@app.get("/api/audit/logs")
async def get_audit_logs(
    db: Session = Depends(get_db)
):
    logs = db.query(AuditLog).order_by(AuditLog.created_time.desc()).limit(100).all()
    return {
        "success": True,
        "data": [
            {
                "id": log.id,
                "image_id": log.image_id,
                "action": log.action,
                "comment": log.comment,
                "created_time": log.created_time.isoformat()
            }
            for log in logs
        ]
    }


@app.put("/api/ocr/{image_id}/edit")
async def edit_ocr_result(
    image_id: int,
    edited_text: str = Body(...),
    db: Session = Depends(get_db)
):
    result = db.query(OCRResult).filter(OCRResult.image_id == image_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="OCR result not found")
    
    result.edited_text = edited_text
    db.commit()
    
    return {"success": True, "message": "文本已更新"}


@app.get("/")
async def root():
    return {"message": "多模态古籍文字识别与修复系统 API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
