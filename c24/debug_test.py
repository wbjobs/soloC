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

print("Test 8: Inflow/Outflow boundary conditions...")
solver = FluidSolver(10, 5, 1.0, 1.0, 0.01, 0.1, backend=SolverBackend.NUMPY)

bc_inflow = BoundaryCondition(type=BoundaryType.INFLOW, u_value=2.0, v_value=0.0)
bc_outflow = BoundaryCondition(type=BoundaryType.OUTFLOW)
bc_noslip = BoundaryCondition(type=BoundaryType.NOSLIP)

u0 = np.ones((5, 10)) * 0.5
v0 = np.ones((5, 10)) * 0.3
solver.set_initial_conditions(u0, v0)

solver.set_boundary_conditions(
    left=bc_inflow,
    right=bc_outflow,
    top=bc_noslip,
    bottom=bc_noslip
)

print(f"Before step - Left boundary u: {solver.u[:, 0]}")
solver.step()
print(f"After step - Left boundary u: {solver.u[:, 0]}")
print(f"Are all 2.0? {np.allclose(solver.u[:, 0], 2.0)}")
print(f"Max diff: {np.max(np.abs(solver.u[:, 0] - 2.0))}")

print(f"\nbc_left: {solver.bc_left}")
