import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from pyfluid import (
    FluidSolver,
    SolverBackend
)

print("Debugging pressure poisson equation...")

nx, ny = 5, 5
dt = 0.01

solver = FluidSolver(nx, ny, 1.0, 1.0, dt, 0.1, backend=SolverBackend.NUMPY)

# Create a very small perturbation in center
u0 = np.zeros((ny, nx))
v0 = np.zeros((ny, nx))
u0[2, 2] = 0.001
v0[2, 2] = 0.001

print(f"Initial u:\n{u0}")
print(f"Initial v:\n{v0}")
print(f"Initial p:\n{solver.p}")

solver.set_initial_conditions(u0, v0)

# Manually step through
u_prev = solver.u.copy()
v_prev = solver.v.copy()

print("\n--- After compute_convective_terms ---")
solver._compute_convective_terms(u_prev, v_prev)
print(f"u after convective:\n{solver.u}")

print("\n--- After apply_viscous_terms ---")
solver._apply_viscous_terms(u_prev, v_prev)
print(f"u after viscous:\n{solver.u}")

print("\n--- After apply_velocity_boundary_conditions ---")
solver._apply_velocity_boundary_conditions()
print(f"u after boundary:\n{solver.u}")

print("\n--- Before solve_pressure_poisson ---")
print(f"p before:\n{solver.p}")

# Check divergence
print("\n--- Checking divergence ---")
for i in range(1, nx-1):
    for j in range(1, ny-1):
        du_dx = (solver.u[j, i+1] - solver.u[j, i-1]) / (2.0 * solver.dx)
        dv_dy = (solver.v[j+1, i] - solver.v[j-1, i]) / (2.0 * solver.dy)
        print(f"  [{j},{i}]: du_dx={du_dx:.10f}, dv_dy={dv_dy:.10f}, div={du_dx+dv_dy:.10f}")

print("\n--- After solve_pressure_poisson ---")
solver._solve_pressure_poisson()
print(f"p after:\n{solver.p}")

print("\n--- After apply_velocity_correction ---")
solver._apply_velocity_correction()
print(f"u after correction:\n{solver.u}")
print(f"v after correction:\n{solver.v}")

print("\nTest completed!")
