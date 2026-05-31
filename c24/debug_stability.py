import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from pyfluid import (
    FluidSolver,
    BoundaryCondition,
    BoundaryType,
    SolverBackend
)

print("Testing stability with small dt...")

nx, ny = 15, 15
dt = 0.001  # Very small time step

solver = FluidSolver(nx, ny, 1.0, 1.0, dt, 0.1, backend=SolverBackend.NUMPY)

u0 = np.zeros((ny, nx))
v0 = np.zeros((ny, nx))

for i in range(nx):
    for j in range(ny):
        cx, cy = (nx-1)/2, (ny-1)/2
        dx_val = (i - cx) / 5.0
        dy_val = (j - cy) / 5.0
        r2 = dx_val**2 + dy_val**2
        decay = np.exp(-r2 / 0.2) * 0.1  # Reduce initial velocity
        u0[j, i] = -dy_val * decay
        v0[j, i] = dx_val * decay

print(f"Initial u max: {np.max(np.abs(u0)):.6f}")
print(f"Initial v max: {np.max(np.abs(v0)):.6f}")

solver.set_initial_conditions(u0, v0)

for step in range(50):
    try:
        solver.step()
        if step % 5 == 0:
            u_max = np.max(np.abs(solver.u))
            v_max = np.max(np.abs(solver.v))
            p_max = np.max(np.abs(solver.p))
            print(f"Step {step}: |u|_max={u_max:.6f}, |v|_max={v_max:.6f}, |p|_max={p_max:.6f}")
    except Exception as e:
        print(f"Error at step {step}: {e}")
        print(f"u before error: {solver.u[5:10, 5:10]}")
        break

print("\nTest completed!")
