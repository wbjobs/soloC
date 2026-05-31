import numpy as np
import math
from typing import Callable, Dict, List, Tuple, Union


class Particle:
    def __init__(self, dim: int, bounds: List[Tuple[float, float]]):
        self.position = np.array([np.random.uniform(b[0], b[1]) for b in bounds])
        self.velocity = np.random.uniform(-1, 1, dim)
        self.best_position = np.copy(self.position)
        self.best_fitness = float('inf')


class PSO:
    def __init__(
        self,
        objective_functions: List[Callable[[Dict[str, float]], float]],
        variables: List[str],
        bounds: Dict[str, Tuple[float, float]],
        n_particles: int = 30,
        max_iterations: int = 100,
        w: float = 0.7,
        c1: float = 1.5,
        c2: float = 1.5,
        weights: List[float] = None,
        early_stopping: bool = True,
        early_stopping_patience: int = 15,
        early_stopping_tol: float = 1e-6,
        warm_start_data: dict = None
    ):
        self.objective_functions = objective_functions
        self.variables = variables
        self.bounds = [bounds[var] for var in variables]
        self.n_particles = n_particles
        self.max_iterations = max_iterations
        self.w = w
        self.c1 = c1
        self.c2 = c2
        self.early_stopping = early_stopping
        self.early_stopping_patience = early_stopping_patience
        self.early_stopping_tol = early_stopping_tol
        
        if weights:
            total_weight = sum(weights)
            if total_weight > 0:
                self.weights = [w / total_weight for w in weights]
            else:
                self.weights = [1.0 / len(objective_functions)] * len(objective_functions)
        else:
            self.weights = [1.0 / len(objective_functions)] * len(objective_functions)
            
        self.dim = len(variables)
        self.convergence_curve = []
        self.mean_fitness_curve = []
        self.final_iteration = 0
        
        if warm_start_data:
            self._load_warm_start(warm_start_data)
        else:
            self.particles = [Particle(self.dim, self.bounds) for _ in range(n_particles)]
            self.global_best_position = np.copy(self.particles[0].position)
            self.global_best_fitness = float('inf')

    def _load_warm_start(self, warm_start_data: dict):
        particle_data = warm_start_data.get("particles", [])
        self.particles = []
        for p_data in particle_data:
            particle = Particle(self.dim, self.bounds)
            particle.position = np.array(p_data["position"])
            particle.velocity = np.array(p_data["velocity"])
            particle.best_position = np.array(p_data["best_position"])
            particle.best_fitness = p_data["best_fitness"]
            self.particles.append(particle)
        
        self.global_best_position = np.array(warm_start_data["global_best_position"])
        self.global_best_fitness = warm_start_data["global_best_fitness"]
        self.convergence_curve = warm_start_data.get("convergence_curve", [])
        self.mean_fitness_curve = warm_start_data.get("mean_fitness_curve", [])

    def evaluate(self, position: np.ndarray) -> float:
        var_dict = {self.variables[i]: position[i] for i in range(self.dim)}
        
        if len(self.objective_functions) == 1:
            return self.objective_functions[0](var_dict)
        
        weighted_sum = 0.0
        for i, func in enumerate(self.objective_functions):
            weighted_sum += self.weights[i] * func(var_dict)
        return weighted_sum

    def _get_particles_state(self) -> dict:
        particle_states = []
        for particle in self.particles:
            particle_states.append({
                "position": particle.position.tolist(),
                "velocity": particle.velocity.tolist(),
                "best_position": particle.best_position.tolist(),
                "best_fitness": particle.best_fitness
            })
        return {
            "particles": particle_states,
            "global_best_position": self.global_best_position.tolist(),
            "global_best_fitness": self.global_best_fitness,
            "convergence_curve": self.convergence_curve.copy(),
            "mean_fitness_curve": self.mean_fitness_curve.copy()
        }

    def optimize(self):
        if not self.convergence_curve:
            fitness_values = []
            for particle in self.particles:
                fitness = self.evaluate(particle.position)
                particle.best_fitness = fitness
                fitness_values.append(fitness)
                if fitness < self.global_best_fitness:
                    self.global_best_fitness = fitness
                    self.global_best_position = np.copy(particle.position)

            self.convergence_curve.append(self.global_best_fitness)
            self.mean_fitness_curve.append(float(np.mean(fitness_values)))

        best_fitness_history = []
        no_improve_count = 0
        start_iteration = len(self.convergence_curve) - 1

        for iteration in range(start_iteration, self.max_iterations):
            fitness_values = []
            for particle in self.particles:
                r1 = np.random.random(self.dim)
                r2 = np.random.random(self.dim)

                cognitive = self.c1 * r1 * (particle.best_position - particle.position)
                social = self.c2 * r2 * (self.global_best_position - particle.position)
                particle.velocity = self.w * particle.velocity + cognitive + social

                particle.position = particle.position + particle.velocity

                for i in range(self.dim):
                    if particle.position[i] < self.bounds[i][0]:
                        particle.position[i] = self.bounds[i][0]
                    if particle.position[i] > self.bounds[i][1]:
                        particle.position[i] = self.bounds[i][1]

                fitness = self.evaluate(particle.position)
                fitness_values.append(fitness)

                if fitness < particle.best_fitness:
                    particle.best_fitness = fitness
                    particle.best_position = np.copy(particle.position)

                if fitness < self.global_best_fitness:
                    self.global_best_fitness = fitness
                    self.global_best_position = np.copy(particle.position)

            self.convergence_curve.append(self.global_best_fitness)
            self.mean_fitness_curve.append(float(np.mean(fitness_values)))
            self.final_iteration = iteration + 1

            if self.early_stopping:
                best_fitness_history.append(self.global_best_fitness)
                if len(best_fitness_history) > self.early_stopping_patience:
                    best_fitness_history.pop(0)
                
                if len(best_fitness_history) >= self.early_stopping_patience:
                    best_old = min(best_fitness_history[:-1])
                    improvement = abs(best_old - self.global_best_fitness)
                    if improvement < self.early_stopping_tol:
                        no_improve_count += 1
                    else:
                        no_improve_count = 0
                    
                    if no_improve_count >= self.early_stopping_patience:
                        break

        best_solution = {self.variables[i]: float(self.global_best_position[i]) for i in range(self.dim)}
        
        return {
            "best_solution": best_solution,
            "best_fitness": float(self.global_best_fitness),
            "convergence_curve": [float(val) for val in self.convergence_curve],
            "mean_fitness_curve": [float(val) for val in self.mean_fitness_curve],
            "final_iteration": self.final_iteration,
            "particles_state": self._get_particles_state()
        }


def safe_div(a: float, b: float) -> float:
    if abs(b) < 1e-10:
        return 1e10
    return a / b


def safe_log(a: float) -> float:
    if a <= 0:
        return -1e10
    return math.log(a)


def safe_sqrt(a: float) -> float:
    if a < 0:
        return 0.0
    return math.sqrt(a)


def parse_expression(expr: str) -> Callable[[Dict[str, float]], float]:
    def evaluate(vars_dict: Dict[str, float]) -> float:
        namespace = {
            'sin': math.sin,
            'cos': math.cos,
            'tan': math.tan,
            'exp': math.exp,
            'log': safe_log,
            'sqrt': safe_sqrt,
            'abs': abs,
            'pi': math.pi,
            'e': math.e,
            'pow': pow,
            'div': safe_div
        }
        namespace.update(vars_dict)
        
        safe_expr = expr.replace('^', '**')
        
        import re
        safe_expr = re.sub(r'(\d+\.?\d*|\w+)\s*/\s*(\d+\.?\d*|\w+)', r'div(\1, \2)', safe_expr)
        
        try:
            result = eval(safe_expr, {"__builtins__": {}}, namespace)
            if math.isnan(result) or math.isinf(result):
                return 1e10
            return float(result)
        except (ZeroDivisionError, ValueError, OverflowError):
            return 1e10
    
    return evaluate


def run_pso(
    expressions: List[str],
    variables: List[str],
    bounds: Dict[str, Tuple[float, float]],
    n_particles: int,
    max_iterations: int,
    weights: List[float] = None,
    early_stopping: bool = True,
    early_stopping_patience: int = 15,
    early_stopping_tol: float = 1e-6,
    warm_start_data: dict = None
) -> Dict:
    objective_functions = [parse_expression(expr) for expr in expressions]
    
    pso = PSO(
        objective_functions=objective_functions,
        variables=variables,
        bounds=bounds,
        n_particles=n_particles,
        max_iterations=max_iterations,
        weights=weights,
        early_stopping=early_stopping,
        early_stopping_patience=early_stopping_patience,
        early_stopping_tol=early_stopping_tol,
        warm_start_data=warm_start_data
    )
    
    return pso.optimize()
