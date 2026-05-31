from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from celery.result import AsyncResult
from typing import Union, List, Dict
import json
import io
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from celery_app import celery_app
from schemas import (
    SingleObjectiveRequest,
    WeightedObjectiveRequest,
    TaskResponse,
    TaskStatusResponse,
    OptimizationResult,
    ConvergenceCurve
)
from config import Config
from tasks import generate_task_key, get_cached_result

app = FastAPI(
    title="PSO Optimization API",
    description="基于粒子群优化算法的数学函数优化 REST API",
    version="1.0.0"
)


def prepare_task_params(request: Union[SingleObjectiveRequest, WeightedObjectiveRequest]) -> dict:
    if isinstance(request, SingleObjectiveRequest):
        expressions = [request.expression]
        weights = None
    else:
        expressions = request.expressions
        weights = request.weights
    
    bounds = {k: [v.min, v.max] for k, v in request.bounds.items()}
    
    task_params = {
        "expressions": expressions,
        "variables": request.variables,
        "bounds": bounds,
        "n_particles": request.n_particles,
        "max_iterations": request.max_iterations,
        "weights": weights,
        "mode": request.mode,
        "early_stopping": request.early_stopping.enabled,
        "early_stopping_patience": request.early_stopping.patience,
        "early_stopping_tol": request.early_stopping.tolerance
    }
    
    if request.warm_start:
        task_params["resume_task_id"] = request.warm_start.task_id
        task_params["resume_iteration"] = request.warm_start.resume_iteration
    
    return task_params


@app.post("/api/optimize", response_model=TaskResponse, status_code=202)
async def submit_optimization_task(
    request: Union[SingleObjectiveRequest, WeightedObjectiveRequest]
):
    try:
        task_params = prepare_task_params(request)
        task_key = generate_task_key(task_params)
        
        cached_result = get_cached_result(task_key)
        if cached_result:
            return TaskResponse(
                task_id="cached",
                status="cached",
                message="任务结果已缓存，可直接获取"
            )
        
        task = celery_app.send_task(
            'tasks.run_pso_optimization',
            args=[task_params],
            queue='pso_queue'
        )
        
        return TaskResponse(
            task_id=task.id,
            status="queued",
            message="任务已提交，正在等待处理"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"任务提交失败: {str(e)}")


@app.get("/api/task/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    if task_id == "cached":
        return TaskStatusResponse(
            task_id=task_id,
            status="success",
            from_cache=True,
            message="结果来自缓存"
        )
    
    try:
        result = AsyncResult(task_id, app=celery_app)
        
        if result.state == 'PENDING':
            return TaskStatusResponse(
                task_id=task_id,
                status="pending",
                message="任务正在等待执行"
            )
        elif result.state == 'STARTED':
            return TaskStatusResponse(
                task_id=task_id,
                status="running",
                message="任务正在执行中"
            )
        elif result.state == 'SUCCESS':
            task_result = result.result
            
            if task_result.get("status") == "success":
                optimization_result = task_result["result"]
                global_best = optimization_result.get("convergence_curve", [])
                mean_fitness = optimization_result.get("mean_fitness_curve", [])
                
                formatted_result = {
                    "best_solution": optimization_result["best_solution"],
                    "best_fitness": optimization_result["best_fitness"],
                    "final_iteration": optimization_result.get("final_iteration", len(global_best) - 1),
                    "convergence_curve": {
                        "iterations": list(range(len(global_best))),
                        "global_best": global_best,
                        "mean_fitness": mean_fitness if mean_fitness else global_best
                    }
                }
                
                return TaskStatusResponse(
                    task_id=task_id,
                    status="success",
                    from_cache=task_result.get("from_cache", False),
                    result=formatted_result
                )
            else:
                return TaskStatusResponse(
                    task_id=task_id,
                    status="error",
                    error=task_result.get("error", "未知错误")
                )
        elif result.state == 'FAILURE':
            return TaskStatusResponse(
                task_id=task_id,
                status="error",
                error=str(result.result)
            )
        else:
            return TaskStatusResponse(
                task_id=task_id,
                status=result.state.lower(),
                message=f"任务状态: {result.state}"
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取任务状态失败: {str(e)}")


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "pso-optimization-api"}


@app.get("/api/stats")
async def get_system_stats():
    from tasks import redis_client
    
    try:
        queue_key = "pso_queue"
        queue_length = redis_client.llen(queue_key)
        
        counter_key = "pso:concurrency:counter"
        active_tasks = int(redis_client.get(counter_key) or 0)
        
        return {
            "queue_length": queue_length,
            "active_tasks": active_tasks,
            "max_concurrent": Config.MAX_CONCURRENT_TASKS
        }
    except Exception as e:
        return {
            "error": f"无法获取统计信息: {str(e)}"
        }


def generate_convergence_plot(task_results: List[dict], task_names: List[str] = None) -> bytes:
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 10))
    
    if task_names is None:
        task_names = [f"Task {i+1}" for i in range(len(task_results))]
    
    colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd']
    
    for i, result in enumerate(task_results):
        color = colors[i % len(colors)]
        global_best = result.get("convergence_curve", {}).get("global_best", [])
        mean_fitness = result.get("convergence_curve", {}).get("mean_fitness", [])
        iterations = list(range(len(global_best)))
        
        ax1.plot(iterations, global_best, color=color, label=f"{task_names[i]} (Global Best)", linewidth=2)
        ax2.plot(iterations, mean_fitness, color=color, label=f"{task_names[i]} (Mean Fitness)", linewidth=2, linestyle='--')
    
    ax1.set_xlabel('Iteration', fontsize=12)
    ax1.set_ylabel('Fitness', fontsize=12)
    ax1.set_title('Global Best Convergence', fontsize=14, fontweight='bold')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    ax1.set_yscale('log' if len(task_results) > 0 and min(task_results[0].get("convergence_curve", {}).get("global_best", [1])) > 0 else 'linear')
    
    ax2.set_xlabel('Iteration', fontsize=12)
    ax2.set_ylabel('Fitness', fontsize=12)
    ax2.set_title('Population Mean Fitness', fontsize=14, fontweight='bold')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    plt.close(fig)
    
    return buf.getvalue()


@app.get("/api/task/{task_id}/plot", response_class=Response)
async def get_task_convergence_plot(task_id: str):
    try:
        result = AsyncResult(task_id, app=celery_app)
        
        if result.state != 'SUCCESS':
            raise HTTPException(status_code=400, detail=f"任务尚未完成，当前状态: {result.state}")
        
        task_result = result.result
        if task_result.get("status") != "success":
            raise HTTPException(status_code=400, detail="任务执行失败，无法生成图表")
        
        optimization_result = task_result["result"]
        global_best = optimization_result.get("convergence_curve", [])
        mean_fitness = optimization_result.get("mean_fitness_curve", [])
        
        plot_data = {
            "convergence_curve": {
                "global_best": global_best,
                "mean_fitness": mean_fitness
            }
        }
        
        png_data = generate_convergence_plot([plot_data], [task_id[:8] + "..."])
        
        return Response(content=png_data, media_type="image/png")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成图表失败: {str(e)}")


@app.post("/api/compare/plot", response_class=Response)
async def compare_tasks_plot(task_ids: List[str]):
    try:
        results = []
        names = []
        
        for task_id in task_ids:
            result = AsyncResult(task_id, app=celery_app)
            
            if result.state != 'SUCCESS':
                raise HTTPException(status_code=400, detail=f"任务 {task_id} 尚未完成，当前状态: {result.state}")
            
            task_result = result.result
            if task_result.get("status") != "success":
                raise HTTPException(status_code=400, detail=f"任务 {task_id} 执行失败")
            
            optimization_result = task_result["result"]
            global_best = optimization_result.get("convergence_curve", [])
            mean_fitness = optimization_result.get("mean_fitness_curve", [])
            
            results.append({
                "convergence_curve": {
                    "global_best": global_best,
                    "mean_fitness": mean_fitness
                }
            })
            names.append(task_id[:8] + "...")
        
        png_data = generate_convergence_plot(results, names)
        
        return Response(content=png_data, media_type="image/png")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成对比图表失败: {str(e)}")
