from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import asyncio
import json

from database import get_db, db_writer, execute_with_retry, RegisterHistory, Rule, RuleLog
from modbus_server import modbus_simulator, RegisterData
from rule_engine import rule_engine

app = FastAPI(title="Modbus TCP Simulator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Modbus TCP Simulator API"}

@app.get("/api/devices")
async def get_devices():
    return {"devices": [1, 2, 3]}

@app.get("/api/devices/{device_id}/registers", response_model=List[RegisterData])
async def get_registers(device_id: int):
    try:
        registers = modbus_simulator.get_all_registers(device_id)
        
        timestamp = datetime.utcnow()
        for reg in registers:
            db_writer.write(
                device_id=device_id,
                register_address=reg.address,
                value=reg.value,
                timestamp=timestamp
            )
        
        return registers
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/devices/{device_id}/registers/{address}")
async def get_register(device_id: int, address: int):
    try:
        value = modbus_simulator.read_registers(device_id, address, 1)[0]
        
        db_writer.write(
            device_id=device_id,
            register_address=address,
            value=value
        )
        
        return {
            "device_id": device_id,
            "address": address,
            "value": value,
            "name": modbus_simulator.register_names[address]
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/devices/{device_id}/registers/{address}")
async def write_register(device_id: int, address: int, value: float):
    try:
        modbus_simulator.write_register(device_id, address, value)
        
        db_writer.write(
            device_id=device_id,
            register_address=address,
            value=value
        )
        
        return {"success": True, "device_id": device_id, "address": address, "value": value}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/history")
async def get_history(
    device_id: Optional[int] = None,
    register_address: Optional[int] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    def _query():
        query = db.query(RegisterHistory)
        
        if device_id is not None:
            query = query.filter(RegisterHistory.device_id == device_id)
        
        if register_address is not None:
            query = query.filter(RegisterHistory.register_address == register_address)
        
        if start_time:
            try:
                start_dt = datetime.fromisoformat(start_time)
                query = query.filter(RegisterHistory.timestamp >= start_dt)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_time format. Use ISO format.")
        
        if end_time:
            try:
                end_dt = datetime.fromisoformat(end_time)
                query = query.filter(RegisterHistory.timestamp <= end_dt)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end_time format. Use ISO format.")
        
        query = query.order_by(RegisterHistory.timestamp.desc()).limit(limit)
        return query.all()
    
    try:
        records = execute_with_retry(_query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    return {
        "count": len(records),
        "data": [
            {
                "id": r.id,
                "device_id": r.device_id,
                "register_address": r.register_address,
                "value": r.value,
                "timestamp": r.timestamp.isoformat()
            }
            for r in records
        ]
    }

@app.get("/api/register-names")
async def get_register_names():
    return {"names": modbus_simulator.register_names}

@app.get("/api/rules")
async def get_rules(db: Session = Depends(get_db)):
    def _query():
        return db.query(Rule).order_by(Rule.updated_at.desc()).all()
    
    try:
        rules = execute_with_retry(_query)
        return {
            "count": len(rules),
            "data": [
                {
                    "id": r.id,
                    "name": r.name,
                    "description": r.description,
                    "enabled": r.enabled,
                    "condition": json.loads(r.condition_json) if r.condition_json else {},
                    "actions": json.loads(r.action_json) if r.action_json else [],
                    "created_at": r.created_at.isoformat(),
                    "updated_at": r.updated_at.isoformat()
                }
                for r in rules
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/rules/{rule_id}")
async def get_rule(rule_id: int, db: Session = Depends(get_db)):
    def _query():
        return db.query(Rule).filter(Rule.id == rule_id).first()
    
    try:
        rule = execute_with_retry(_query)
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        return {
            "id": rule.id,
            "name": rule.name,
            "description": rule.description,
            "enabled": rule.enabled,
            "condition": json.loads(rule.condition_json) if rule.condition_json else {},
            "actions": json.loads(rule.action_json) if rule.action_json else [],
            "created_at": rule.created_at.isoformat(),
            "updated_at": rule.updated_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/api/rules")
async def create_rule(
    name: str,
    description: str = "",
    enabled: int = 1,
    condition: dict = None,
    actions: list = None,
    db: Session = Depends(get_db)
):
    try:
        condition_json = json.dumps(condition or {})
        action_json = json.dumps(actions or [])
        
        rule = Rule(
            name=name,
            description=description,
            enabled=enabled,
            condition_json=condition_json,
            action_json=action_json
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)
        
        return {
            "success": True,
            "id": rule.id,
            "name": rule.name
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create rule: {str(e)}")

@app.put("/api/rules/{rule_id}")
async def update_rule(
    rule_id: int,
    name: str = None,
    description: str = None,
    enabled: int = None,
    condition: dict = None,
    actions: list = None,
    db: Session = Depends(get_db)
):
    try:
        rule = db.query(Rule).filter(Rule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        if name is not None:
            rule.name = name
        if description is not None:
            rule.description = description
        if enabled is not None:
            rule.enabled = enabled
        if condition is not None:
            rule.condition_json = json.dumps(condition)
        if actions is not None:
            rule.action_json = json.dumps(actions)
        
        rule.updated_at = datetime.utcnow()
        db.commit()
        
        return {"success": True, "id": rule.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update rule: {str(e)}")

@app.delete("/api/rules/{rule_id}")
async def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    try:
        rule = db.query(Rule).filter(Rule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        db.delete(rule)
        db.commit()
        
        return {"success": True, "message": "Rule deleted"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete rule: {str(e)}")

@app.post("/api/rules/{rule_id}/execute")
async def execute_rule(rule_id: int, device_id: int, db: Session = Depends(get_db)):
    try:
        rule = db.query(Rule).filter(Rule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        registers = modbus_simulator.get_all_registers(device_id)
        register_values = [r.value for r in registers]
        
        rule_data = {
            "condition": json.loads(rule.condition_json) if rule.condition_json else {},
            "actions": json.loads(rule.action_json) if rule.action_json else []
        }
        
        result = rule_engine.execute_rule(rule_data, register_values)
        
        for reg_addr, change in result['register_changes'].items():
            modbus_simulator.write_register(device_id, reg_addr, change['new'])
        
        rule_log = RuleLog(
            rule_id=rule_id,
            device_id=device_id,
            triggered=1 if result['triggered'] else 0,
            message="; ".join(result['messages'])
        )
        db.add(rule_log)
        db.commit()
        
        return {
            "rule_id": rule_id,
            "device_id": device_id,
            "triggered": result['triggered'],
            "condition_met": result['condition_met'],
            "register_changes": result['register_changes'],
            "alarms": result['alarms'],
            "messages": result['messages']
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute rule: {str(e)}")

@app.post("/api/rules/execute-all")
async def execute_all_rules(device_id: int, db: Session = Depends(get_db)):
    try:
        rules = db.query(Rule).filter(Rule.enabled == 1).all()
        
        registers = modbus_simulator.get_all_registers(device_id)
        register_values = [r.value for r in registers]
        
        results = []
        for rule in rules:
            rule_data = {
                "condition": json.loads(rule.condition_json) if rule.condition_json else {},
                "actions": json.loads(rule.action_json) if rule.action_json else []
            }
            
            result = rule_engine.execute_rule(rule_data, register_values)
            
            for reg_addr, change in result['register_changes'].items():
                modbus_simulator.write_register(device_id, reg_addr, change['new'])
            
            rule_log = RuleLog(
                rule_id=rule.id,
                device_id=device_id,
                triggered=1 if result['triggered'] else 0,
                message="; ".join(result['messages'])
            )
            db.add(rule_log)
            
            results.append({
                "rule_id": rule.id,
                "rule_name": rule.name,
                "triggered": result['triggered'],
                "messages": result['messages']
            })
        
        db.commit()
        
        return {
            "device_id": device_id,
            "rules_executed": len(results),
            "results": results
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to execute rules: {str(e)}")

@app.get("/api/rule-logs")
async def get_rule_logs(
    rule_id: Optional[int] = None,
    device_id: Optional[int] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    def _query():
        query = db.query(RuleLog)
        
        if rule_id is not None:
            query = query.filter(RuleLog.rule_id == rule_id)
        
        if device_id is not None:
            query = query.filter(RuleLog.device_id == device_id)
        
        return query.order_by(RuleLog.timestamp.desc()).limit(limit).all()
    
    try:
        logs = execute_with_retry(_query)
        
        return {
            "count": len(logs),
            "data": [
                {
                    "id": log.id,
                    "rule_id": log.rule_id,
                    "device_id": log.device_id,
                    "triggered": log.triggered,
                    "message": log.message,
                    "timestamp": log.timestamp.isoformat()
                }
                for log in logs
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(modbus_simulator.simulate_data_changes())
    asyncio.create_task(auto_execute_rules())

async def auto_execute_rules():
    from database import SessionLocal
    await asyncio.sleep(5)
    
    while True:
        try:
            db = SessionLocal()
            rules = db.query(Rule).filter(Rule.enabled == 1).all()
            
            for device_id in [1, 2, 3]:
                registers = modbus_simulator.get_all_registers(device_id)
                register_values = [r.value for r in registers]
                
                for rule in rules:
                    try:
                        rule_data = {
                            "condition": json.loads(rule.condition_json) if rule.condition_json else {},
                            "actions": json.loads(rule.action_json) if rule.action_json else []
                        }
                        
                        result = rule_engine.execute_rule(rule_data, register_values)
                        
                        if result['triggered']:
                            for reg_addr, change in result['register_changes'].items():
                                modbus_simulator.write_register(device_id, reg_addr, change['new'])
                            
                            rule_log = RuleLog(
                                rule_id=rule.id,
                                device_id=device_id,
                                triggered=1,
                                message="; ".join(result['messages'])
                            )
                            db.add(rule_log)
                    except Exception as e:
                        pass
            
            db.commit()
            db.close()
        except Exception as e:
            pass
        
        await asyncio.sleep(2)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
