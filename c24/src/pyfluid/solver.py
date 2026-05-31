import numpy as np
from enum import Enum
from dataclasses import dataclass
from typing import Optional, Tuple, TYPE_CHECKING, List

try:
    from .obstacles import Obstacle, ObstacleBoundaryType
    _HAS_OBSTACLES = True
except ImportError:
    _HAS_OBSTACLES = False
    Obstacle = None
    ObstacleBoundaryType = None

try:
    from ._fluid_solver import (
        FluidSolver as CppFluidSolver,
        BoundaryType as CppBoundaryType,
        BoundaryCondition as CppBoundaryCondition,
    )
    _CPP_AVAILABLE = True
except ImportError:
    _CPP_AVAILABLE = False
    CppFluidSolver = None
    CppBoundaryType = None
    CppBoundaryCondition = None

try:
    from numba import jit
    _NUMBA_AVAILABLE = True
except ImportError:
    _NUMBA_AVAILABLE = False
    jit = lambda x: x


class SolverBackend(Enum):
    CPP = 'cpp'
    NUMBA = 'numba'
    NUMPY = 'numpy'


class BoundaryType(Enum):
    NOSLIP = 0
    INFLOW = 1
    OUTFLOW = 2
    PERIODIC = 3


@dataclass
class BoundaryCondition:
    type: BoundaryType = BoundaryType.NOSLIP
    u_value: float = 0.0
    v_value: float = 0.0
    p_value: float = 0.0


class FluidSolver:
    def __init__(
        self,
        nx: int,
        ny: int,
        dx: float = 1.0,
        dy: float = 1.0,
        dt: float = 0.01,
        nu: float = 0.1,
        backend: Optional[SolverBackend] = None
    ):
        self.nx = nx
        self.ny = ny
        self.dx = dx
        self.dy = dy
        self.dt = dt
        self.nu = nu
        self.rho = 1.0
        
        self.u = np.zeros((ny, nx), dtype=np.float64)
        self.v = np.zeros((ny, nx), dtype=np.float64)
        self.p = np.zeros((ny, nx), dtype=np.float64)
        
        self.bc_left = BoundaryCondition()
        self.bc_right = BoundaryCondition()
        self.bc_top = BoundaryCondition()
        self.bc_bottom = BoundaryCondition()
        
        self.obstacles: List[Obstacle] = []
        self.obstacle_mask = np.zeros((ny, nx), dtype=bool)
        self._obstacle_u_vals = np.zeros((ny, nx, 2), dtype=np.float64)
        
        if backend is None:
            if _CPP_AVAILABLE:
                self.backend = SolverBackend.CPP
            elif _NUMBA_AVAILABLE:
                self.backend = SolverBackend.NUMBA
            else:
                self.backend = SolverBackend.NUMPY
        else:
            self.backend = backend
        
        self._cpp_solver = None
        if self.backend == SolverBackend.CPP:
            if not _CPP_AVAILABLE:
                raise RuntimeError("C++ backend not available. Please compile the extension module.")
            self._cpp_solver = CppFluidSolver(nx, ny, dx, dy, dt, nu)
    
    def set_boundary_conditions(
        self,
        left: Optional[BoundaryCondition] = None,
        right: Optional[BoundaryCondition] = None,
        top: Optional[BoundaryCondition] = None,
        bottom: Optional[BoundaryCondition] = None
    ):
        if left:
            self.bc_left = left
        if right:
            self.bc_right = right
        if top:
            self.bc_top = top
        if bottom:
            self.bc_bottom = bottom
        
        if self.backend == SolverBackend.CPP and self._cpp_solver:
            self._cpp_solver.set_boundary_conditions(
                self._convert_to_cpp_bc(self.bc_left),
                self._convert_to_cpp_bc(self.bc_right),
                self._convert_to_cpp_bc(self.bc_top),
                self._convert_to_cpp_bc(self.bc_bottom),
            )
    
    def _convert_to_cpp_bc(self, bc: BoundaryCondition) -> CppBoundaryCondition:
        cpp_type = {
            BoundaryType.NOSLIP: CppBoundaryType.NOSLIP,
            BoundaryType.INFLOW: CppBoundaryType.INFLOW,
            BoundaryType.OUTFLOW: CppBoundaryType.OUTFLOW,
            BoundaryType.PERIODIC: CppBoundaryType.PERIODIC,
        }[bc.type]
        return CppBoundaryCondition(cpp_type, bc.u_value, bc.v_value, bc.p_value)
    
    def set_initial_conditions(
        self,
        u: Optional[np.ndarray] = None,
        v: Optional[np.ndarray] = None,
        p: Optional[np.ndarray] = None
    ):
        if u is not None:
            if u.shape != self.u.shape:
                raise ValueError(f"u shape {u.shape} does not match solver shape {self.u.shape}")
            self.u = u.copy().astype(np.float64)
        if v is not None:
            if v.shape != self.v.shape:
                raise ValueError(f"v shape {v.shape} does not match solver shape {self.v.shape}")
            self.v = v.copy().astype(np.float64)
        if p is not None:
            if p.shape != self.p.shape:
                raise ValueError(f"p shape {p.shape} does not match solver shape {self.p.shape}")
            self.p = p.copy().astype(np.float64)
        
        if self.backend == SolverBackend.CPP and self._cpp_solver:
            self._cpp_solver.set_initial_conditions(
                self.u.flatten().tolist(),
                self.v.flatten().tolist(),
                self.p.flatten().tolist(),
            )
    
    def add_obstacle(self, obstacle: Obstacle) -> None:
        if not _HAS_OBSTACLES:
            raise RuntimeError("Obstacle module not available")
        
        self.obstacles.append(obstacle)
        self._rebuild_obstacle_mask()
    
    def add_obstacles(self, obstacles: List[Obstacle]) -> None:
        if not _HAS_OBSTACLES:
            raise RuntimeError("Obstacle module not available")
        
        self.obstacles.extend(obstacles)
        self._rebuild_obstacle_mask()
    
    def clear_obstacles(self) -> None:
        self.obstacles.clear()
        self.obstacle_mask = np.zeros((self.ny, self.nx), dtype=bool)
        self._obstacle_u_vals = np.zeros((self.ny, self.nx, 2), dtype=np.float64)
    
    def remove_obstacle(self, name: str) -> bool:
        for i, obs in enumerate(self.obstacles):
            if obs.name == name:
                self.obstacles.pop(i)
                self._rebuild_obstacle_mask()
                return True
        return False
    
    def _rebuild_obstacle_mask(self) -> None:
        self.obstacle_mask = np.zeros((self.ny, self.nx), dtype=bool)
        self._obstacle_u_vals = np.zeros((self.ny, self.nx, 2), dtype=np.float64)
        
        for obstacle in self.obstacles:
            mask = obstacle.get_mask(self.nx, self.ny, self.dx, self.dy)
            self.obstacle_mask = np.logical_or(self.obstacle_mask, mask)
            
            for i in range(self.nx):
                for j in range(self.ny):
                    if mask[j, i]:
                        self._obstacle_u_vals[j, i, 0] = obstacle.u_velocity
                        self._obstacle_u_vals[j, i, 1] = obstacle.v_velocity
    
    def get_obstacle_mask(self) -> np.ndarray:
        return self.obstacle_mask.copy()
    
    def step(self):
        if self.backend == SolverBackend.CPP and self._cpp_solver:
            self._cpp_solver.step()
            self._sync_from_cpp()
        else:
            self._step_python()
    
    def run(self, steps: int):
        if self.backend == SolverBackend.CPP and self._cpp_solver:
            self._cpp_solver.run(steps)
            self._sync_from_cpp()
        else:
            for _ in range(steps):
                self._step_python()
    
    def _sync_from_cpp(self):
        if self._cpp_solver:
            self.u = np.array(self._cpp_solver.get_u(), dtype=np.float64).reshape((self.ny, self.nx))
            self.v = np.array(self._cpp_solver.get_v(), dtype=np.float64).reshape((self.ny, self.nx))
            self.p = np.array(self._cpp_solver.get_p(), dtype=np.float64).reshape((self.ny, self.nx))
    
    def get_state(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        return self.u.copy(), self.v.copy(), self.p.copy()
    
    def get_velocity_magnitude(self) -> np.ndarray:
        return np.sqrt(self.u ** 2 + self.v ** 2)
    
    def _step_python(self):
        u_prev = self.u.copy()
        v_prev = self.v.copy()
        
        self._compute_convective_terms(u_prev, v_prev)
        self._apply_viscous_terms(u_prev, v_prev)
        self._apply_velocity_boundary_conditions()
        self._apply_obstacle_velocity_conditions()
        self._solve_pressure_poisson()
        self._apply_obstacle_pressure_conditions()
        self._apply_velocity_correction()
        self._apply_velocity_boundary_conditions()
        self._apply_obstacle_velocity_conditions()
        
        if np.any(np.isnan(self.u)) or np.any(np.isnan(self.v)):
            raise RuntimeError("Numerical instability detected: NaN values in velocity field")
    
    def _apply_obstacle_velocity_conditions(self) -> None:
        if len(self.obstacles) == 0:
            return
        
        self.u[self.obstacle_mask] = self._obstacle_u_vals[self.obstacle_mask, 0]
        self.v[self.obstacle_mask] = self._obstacle_u_vals[self.obstacle_mask, 1]
    
    def _apply_obstacle_pressure_conditions(self) -> None:
        if len(self.obstacles) == 0:
            return
        
        for i in range(self.nx):
            for j in range(self.ny):
                if self.obstacle_mask[j, i]:
                    neighbors = []
                    for di, dj in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        ni, nj = i + di, j + dj
                        if 0 <= ni < self.nx and 0 <= nj < self.ny:
                            if not self.obstacle_mask[nj, ni]:
                                neighbors.append(self.p[nj, ni])
                    
                    if neighbors:
                        self.p[j, i] = np.mean(neighbors)
    
    def _compute_convective_terms(self, u_prev: np.ndarray, v_prev: np.ndarray):
        if _NUMBA_AVAILABLE and self.backend == SolverBackend.NUMBA:
            _compute_convective_terms_jit(
                self.u, self.v, u_prev, v_prev,
                self.dx, self.dy, self.dt, self.nx, self.ny
            )
        else:
            self._compute_convective_terms_numpy(u_prev, v_prev)
    
    def _compute_convective_terms_numpy(self, u_prev: np.ndarray, v_prev: np.ndarray):
        for i in range(1, self.nx - 1):
            for j in range(1, self.ny - 1):
                u = u_prev[j, i]
                v = v_prev[j, i]
                
                du_dx = (u_prev[j, i + 1] - u_prev[j, i - 1]) / (2.0 * self.dx)
                du_dy = (u_prev[j + 1, i] - u_prev[j - 1, i]) / (2.0 * self.dy)
                dv_dx = (v_prev[j, i + 1] - v_prev[j, i - 1]) / (2.0 * self.dx)
                dv_dy = (v_prev[j + 1, i] - v_prev[j - 1, i]) / (2.0 * self.dy)
                
                self.u[j, i] = u_prev[j, i] - self.dt * (u * du_dx + v * du_dy)
                self.v[j, i] = v_prev[j, i] - self.dt * (u * dv_dx + v * dv_dy)
    
    def _apply_viscous_terms(self, u_prev: np.ndarray, v_prev: np.ndarray):
        if _NUMBA_AVAILABLE and self.backend == SolverBackend.NUMBA:
            _apply_viscous_terms_jit(
                self.u, self.v, u_prev, v_prev,
                self.dx, self.dy, self.dt, self.nu, self.nx, self.ny
            )
        else:
            self._apply_viscous_terms_numpy(u_prev, v_prev)
    
    def _apply_viscous_terms_numpy(self, u_prev: np.ndarray, v_prev: np.ndarray):
        for i in range(1, self.nx - 1):
            for j in range(1, self.ny - 1):
                laplacian_u = (
                    (u_prev[j, i + 1] - 2.0 * u_prev[j, i] + u_prev[j, i - 1]) / (self.dx ** 2) +
                    (u_prev[j + 1, i] - 2.0 * u_prev[j, i] + u_prev[j - 1, i]) / (self.dy ** 2)
                )
                laplacian_v = (
                    (v_prev[j, i + 1] - 2.0 * v_prev[j, i] + v_prev[j, i - 1]) / (self.dx ** 2) +
                    (v_prev[j + 1, i] - 2.0 * v_prev[j, i] + v_prev[j - 1, i]) / (self.dy ** 2)
                )
                self.u[j, i] += self.dt * self.nu * laplacian_u
                self.v[j, i] += self.dt * self.nu * laplacian_v
    
    def _apply_velocity_boundary_conditions(self):
        for j in range(self.ny):
            self._apply_velocity_boundary_point(0, j, self.bc_left, 'left')
            self._apply_velocity_boundary_point(self.nx - 1, j, self.bc_right, 'right')
        
        for i in range(self.nx):
            self._apply_velocity_boundary_point(i, 0, self.bc_bottom, 'bottom')
            self._apply_velocity_boundary_point(i, self.ny - 1, self.bc_top, 'top')
    
    def _apply_velocity_boundary_point(self, i: int, j: int, bc: BoundaryCondition, side: str):
        if bc.type == BoundaryType.NOSLIP:
            self.u[j, i] = 0.0
            self.v[j, i] = 0.0
        elif bc.type == BoundaryType.INFLOW:
            self.u[j, i] = bc.u_value
            self.v[j, i] = bc.v_value
        elif bc.type == BoundaryType.OUTFLOW:
            if side == 'left' and self.nx > 2:
                self.u[j, i] = self.u[j, 1]
                self.v[j, i] = self.v[j, 1]
            elif side == 'right' and self.nx > 2:
                self.u[j, i] = self.u[j, self.nx - 2]
                self.v[j, i] = self.v[j, self.nx - 2]
            elif side == 'bottom' and self.ny > 2:
                self.u[j, i] = self.u[1, i]
                self.v[j, i] = self.v[1, i]
            elif side == 'top' and self.ny > 2:
                self.u[j, i] = self.u[self.ny - 2, i]
                self.v[j, i] = self.v[self.ny - 2, i]
    
    def _apply_pressure_boundary_conditions(self):
        for j in range(self.ny):
            self.p[j, 0] = self.p[j, 1]
            self.p[j, self.nx - 1] = self.p[j, self.nx - 2]
        
        for i in range(self.nx):
            self.p[0, i] = self.p[1, i]
            self.p[self.ny - 1, i] = self.p[self.ny - 2, i]
    
    def _solve_pressure_poisson(self):
        max_iters = 200
        tol = 1e-6
        omega = 1.7
        
        if _NUMBA_AVAILABLE and self.backend == SolverBackend.NUMBA:
            _solve_pressure_poisson_sor_jit(
                self.p, self.u, self.v,
                self.dx, self.dy, self.dt, self.rho,
                self.nx, self.ny, max_iters, tol, omega
            )
        else:
            self._solve_pressure_poisson_sor_numpy(max_iters, tol, omega)
    
    def _solve_pressure_poisson_sor_numpy(self, max_iters: int, tol: float, omega: float):
        dx2 = self.dx ** 2
        dy2 = self.dy ** 2
        inv_denom = 1.0 / (2.0 / dx2 + 2.0 / dy2)
        
        for _ in range(max_iters):
            max_err = 0.0
            p_old = self.p.copy()
            
            for i in range(1, self.nx - 1):
                for j in range(1, self.ny - 1):
                    du_dx = (self.u[j, i + 1] - self.u[j, i - 1]) / (2.0 * self.dx)
                    dv_dy = (self.v[j + 1, i] - self.v[j - 1, i]) / (2.0 * self.dy)
                    
                    b = self.rho / self.dt * (du_dx + dv_dy)
                    
                    p_new = (
                        (p_old[j, i + 1] + self.p[j, i - 1]) / dx2 +
                        (p_old[j + 1, i] + self.p[j - 1, i]) / dy2 -
                        b
                    ) * inv_denom
                    
                    p_new = p_old[j, i] + omega * (p_new - p_old[j, i])
                    
                    err = abs(p_new - self.p[j, i])
                    if err > max_err:
                        max_err = err
                    
                    self.p[j, i] = p_new
            
            self._apply_pressure_boundary_conditions()
            
            if max_err < tol:
                break
    
    def _apply_velocity_correction(self):
        if _NUMBA_AVAILABLE and self.backend == SolverBackend.NUMBA:
            _apply_velocity_correction_jit(
                self.u, self.v, self.p,
                self.dx, self.dy, self.dt, self.rho,
                self.nx, self.ny
            )
        else:
            self._apply_velocity_correction_numpy()
    
    def _apply_velocity_correction_numpy(self):
        for i in range(1, self.nx - 1):
            for j in range(1, self.ny - 1):
                dp_dx = (self.p[j, i + 1] - self.p[j, i - 1]) / (2.0 * self.dx)
                dp_dy = (self.p[j + 1, i] - self.p[j - 1, i]) / (2.0 * self.dy)
                
                self.u[j, i] -= self.dt / self.rho * dp_dx
                self.v[j, i] -= self.dt / self.rho * dp_dy


if _NUMBA_AVAILABLE:
    @jit(nopython=True)
    def _compute_convective_terms_jit(u, v, u_prev, v_prev, dx, dy, dt, nx, ny):
        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                u_val = u_prev[j, i]
                v_val = v_prev[j, i]
                
                du_dx = (u_prev[j, i + 1] - u_prev[j, i - 1]) / (2.0 * dx)
                du_dy = (u_prev[j + 1, i] - u_prev[j - 1, i]) / (2.0 * dy)
                dv_dx = (v_prev[j, i + 1] - v_prev[j, i - 1]) / (2.0 * dx)
                dv_dy = (v_prev[j + 1, i] - v_prev[j - 1, i]) / (2.0 * dy)
                
                u[j, i] = u_prev[j, i] - dt * (u_val * du_dx + v_val * du_dy)
                v[j, i] = v_prev[j, i] - dt * (u_val * dv_dx + v_val * dv_dy)
    
    @jit(nopython=True)
    def _apply_viscous_terms_jit(u, v, u_prev, v_prev, dx, dy, dt, nu, nx, ny):
        dx2 = dx * dx
        dy2 = dy * dy
        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                laplacian_u = (
                    (u_prev[j, i + 1] - 2.0 * u_prev[j, i] + u_prev[j, i - 1]) / dx2 +
                    (u_prev[j + 1, i] - 2.0 * u_prev[j, i] + u_prev[j - 1, i]) / dy2
                )
                laplacian_v = (
                    (v_prev[j, i + 1] - 2.0 * v_prev[j, i] + v_prev[j, i - 1]) / dx2 +
                    (v_prev[j + 1, i] - 2.0 * v_prev[j, i] + v_prev[j - 1, i]) / dy2
                )
                u[j, i] += dt * nu * laplacian_u
                v[j, i] += dt * nu * laplacian_v
    
    @jit(nopython=True)
    def _solve_pressure_poisson_sor_jit(p, u, v, dx, dy, dt, rho, nx, ny, max_iters, tol, omega):
        dx2 = dx * dx
        dy2 = dy * dy
        inv_denom = 1.0 / (2.0 / dx2 + 2.0 / dy2)
        
        for _ in range(max_iters):
            max_err = 0.0
            
            for i in range(1, nx - 1):
                for j in range(1, ny - 1):
                    p_old = p[j, i]
                    
                    du_dx = (u[j, i + 1] - u[j, i - 1]) / (2.0 * dx)
                    dv_dy = (v[j + 1, i] - v[j - 1, i]) / (2.0 * dy)
                    
                    b = rho / dt * (du_dx + dv_dy)
                    
                    p_new = (
                        (p[j, i + 1] + p[j, i - 1]) / dx2 +
                        (p[j + 1, i] + p[j - 1, i]) / dy2 -
                        b
                    ) * inv_denom
                    
                    p_new = p_old + omega * (p_new - p_old)
                    
                    err = abs(p_new - p_old)
                    if err > max_err:
                        max_err = err
                    
                    p[j, i] = p_new
            
            for j in range(ny):
                p[j, 0] = p[j, 1]
                p[j, nx - 1] = p[j, nx - 2]
            
            for i in range(nx):
                p[0, i] = p[1, i]
                p[ny - 1, i] = p[ny - 2, i]
            
            if max_err < tol:
                break
    
    @jit(nopython=True)
    def _apply_velocity_correction_jit(u, v, p, dx, dy, dt, rho, nx, ny):
        inv_2dx = 1.0 / (2.0 * dx)
        inv_2dy = 1.0 / (2.0 * dy)
        dt_over_rho = dt / rho
        
        for i in range(1, nx - 1):
            for j in range(1, ny - 1):
                dp_dx = (p[j, i + 1] - p[j, i - 1]) * inv_2dx
                dp_dy = (p[j + 1, i] - p[j - 1, i]) * inv_2dy
                
                u[j, i] -= dt_over_rho * dp_dx
                v[j, i] -= dt_over_rho * dp_dy
