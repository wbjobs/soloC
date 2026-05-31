from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Union


class VariableBounds(BaseModel):
    min: float = Field(..., description="变量最小值")
    max: float = Field(..., description="变量最大值")


class EarlyStoppingConfig(BaseModel):
    enabled: bool = Field(default=True, description="是否启用早停")
    patience: int = Field(default=15, ge=1, description="无改进的连续迭代次数阈值")
    tolerance: float = Field(default=1e-6, description="改进容忍度阈值")


class WarmStartConfig(BaseModel):
    task_id: str = Field(..., description="要恢复的任务ID")
    resume_iteration: int = Field(default=None, description="从指定迭代次数恢复，None表示从最后状态恢复")


class SingleObjectiveRequest(BaseModel):
    expression: str = Field(..., description="数学表达式，如 sin(x) + 0.1*(x-2)^2 + y^2")
    variables: List[str] = Field(..., description="变量列表，如 ['x', 'y']")
    bounds: Dict[str, VariableBounds] = Field(..., description="变量范围，如 {'x': {'min': -10, 'max': 10}}")
    n_particles: int = Field(default=30, ge=10, le=500, description="粒子数量 (10-500)")
    max_iterations: int = Field(default=100, ge=10, le=1000, description="最大迭代次数 (10-1000)")
    mode: str = Field(default="single", description="优化模式: single (单目标) 或 weighted (双目标加权和)")
    early_stopping: EarlyStoppingConfig = Field(default=EarlyStoppingConfig(), description="早停配置")
    warm_start: WarmStartConfig = Field(default=None, description="热启动配置")


class WeightedObjectiveRequest(BaseModel):
    expressions: List[str] = Field(..., description="多个数学表达式，如 ['sin(x) + y^2', 'cos(x) + (y-2)^2']")
    variables: List[str] = Field(..., description="变量列表")
    bounds: Dict[str, VariableBounds] = Field(..., description="变量范围")
    n_particles: int = Field(default=30, ge=10, le=500)
    max_iterations: int = Field(default=100, ge=10, le=1000)
    weights: List[float] = Field(default=[1.0, 1.0], description="目标函数权重")
    mode: str = Field(default="weighted", description="优化模式")
    early_stopping: EarlyStoppingConfig = Field(default=EarlyStoppingConfig(), description="早停配置")
    warm_start: WarmStartConfig = Field(default=None, description="热启动配置")


class TaskResponse(BaseModel):
    task_id: str
    status: str
    message: str


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    from_cache: Optional[bool] = None
    result: Optional[Dict] = None
    error: Optional[str] = None


class ConvergenceCurve(BaseModel):
    iterations: List[int]
    global_best: List[float]
    mean_fitness: List[float]


class OptimizationResult(BaseModel):
    best_solution: Dict[str, float]
    best_fitness: float
    convergence_curve: ConvergenceCurve
