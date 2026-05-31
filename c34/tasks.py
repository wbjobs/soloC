from celery_app import celery_app
from pso import run_pso
import redis
from config import Config
import json
import hashlib
import time

redis_client = redis.from_url(Config.REDIS_URL)


def generate_task_key(task_params: dict) -> str:
    sorted_params = json.dumps(task_params, sort_keys=True)
    return f"pso:cache:{hashlib.md5(sorted_params.encode()).hexdigest()}"


def get_cached_result(task_key: str):
    cached = redis_client.get(task_key)
    if cached:
        return json.loads(cached)
    return None


def cache_result(task_key: str, result: dict, ttl: int = Config.CACHE_TTL):
    redis_client.setex(task_key, ttl, json.dumps(result))


def acquire_concurrency_lock() -> bool:
    lock_key = "pso:concurrency:lock"
    counter_key = "pso:concurrency:counter"
    
    with redis_client.pipeline() as pipe:
        while True:
            try:
                pipe.watch(lock_key, counter_key)
                current_count = int(redis_client.get(counter_key) or 0)
                
                if current_count < Config.MAX_CONCURRENT_TASKS:
                    pipe.multi()
                    pipe.incr(counter_key)
                    pipe.execute()
                    return True
                else:
                    return False
            except redis.WatchError:
                continue


def release_concurrency_lock():
    counter_key = "pso:concurrency:counter"
    redis_client.decr(counter_key)


def get_warm_start_data(task_id: str, resume_iteration: int = None) -> dict:
    from celery.result import AsyncResult
    result = AsyncResult(task_id, app=celery_app)
    
    if result.state == 'SUCCESS':
        task_result = result.result
        if task_result.get("status") == "success":
            full_state = task_result["result"].get("particles_state", {})
            
            if resume_iteration is not None and full_state.get("convergence_curve"):
                conv_curve = full_state.get("convergence_curve", [])
                mean_curve = full_state.get("mean_fitness_curve", [])
                
                if resume_iteration < len(conv_curve):
                    full_state["convergence_curve"] = conv_curve[:resume_iteration + 1]
                    full_state["mean_fitness_curve"] = mean_curve[:resume_iteration + 1] if mean_curve else []
            
            return full_state
    return None


@celery_app.task(bind=True, name='tasks.run_pso_optimization')
def run_pso_optimization(self, task_params: dict):
    try:
        task_key = generate_task_key(task_params)
        
        cached_result = get_cached_result(task_key)
        if cached_result:
            return {
                "status": "success",
                "from_cache": True,
                "result": cached_result
            }
        
        if not acquire_concurrency_lock():
            time.sleep(2)
            raise self.retry(countdown=2, max_retries=10)
        
        try:
            expressions = task_params.get("expressions", [])
            variables = task_params.get("variables", [])
            bounds = task_params.get("bounds", {})
            bounds_tuple = {k: (v[0], v[1]) for k, v in bounds.items()}
            n_particles = task_params.get("n_particles", 30)
            max_iterations = task_params.get("max_iterations", 100)
            weights = task_params.get("weights")
            early_stopping = task_params.get("early_stopping", True)
            early_stopping_patience = task_params.get("early_stopping_patience", 15)
            early_stopping_tol = task_params.get("early_stopping_tol", 1e-6)
            
            warm_start_data = None
            resume_task_id = task_params.get("resume_task_id")
            resume_iteration = task_params.get("resume_iteration")
            if resume_task_id:
                warm_start_data = get_warm_start_data(resume_task_id, resume_iteration)
            
            result = run_pso(
                expressions=expressions,
                variables=variables,
                bounds=bounds_tuple,
                n_particles=n_particles,
                max_iterations=max_iterations,
                weights=weights,
                early_stopping=early_stopping,
                early_stopping_patience=early_stopping_patience,
                early_stopping_tol=early_stopping_tol,
                warm_start_data=warm_start_data
            )
            
            cache_result(task_key, result)
            
            return {
                "status": "success",
                "from_cache": False,
                "result": result
            }
        finally:
            release_concurrency_lock()
            
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }
