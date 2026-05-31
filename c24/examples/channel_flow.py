import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from pyfluid import (
    FluidSolver,
    FluidVisualizer,
    BoundaryCondition,
    BoundaryType,
    SolverBackend
)
from pyfluid.visualization import create_channel_flow_initial_conditions


def main():
    nx, ny = 80, 30
    dx, dy = 1.0, 1.0
    dt = 0.005
    nu = 0.05
    
    print("Creating fluid solver...")
    try:
        solver = FluidSolver(nx, ny, dx, dy, dt, nu, backend=SolverBackend.NUMBA)
        print("Using Numba backend")
    except Exception as e:
        print(f"Numba not available, using NumPy backend: {e}")
        solver = FluidSolver(nx, ny, dx, dy, dt, nu, backend=SolverBackend.NUMPY)
    
    print("Setting initial channel flow conditions...")
    u0, v0, p0 = create_channel_flow_initial_conditions(nx, ny, max_velocity=1.0)
    solver.set_initial_conditions(u0, v0, p0)
    
    print("Setting boundary conditions:")
    print("  - Left: Inflow (u=1.0, v=0.0)")
    print("  - Right: Outflow")
    print("  - Top/Bottom: No-slip")
    
    bc_inflow = BoundaryCondition(
        type=BoundaryType.INFLOW,
        u_value=1.0,
        v_value=0.0
    )
    
    bc_outflow = BoundaryCondition(type=BoundaryType.OUTFLOW)
    bc_noslip = BoundaryCondition(type=BoundaryType.NOSLIP)
    
    solver.set_boundary_conditions(
        left=bc_inflow,
        right=bc_outflow,
        top=bc_noslip,
        bottom=bc_noslip
    )
    
    print("Creating visualizer...")
    visualizer = FluidVisualizer(solver, figsize=(14, 5))
    
    print("Running channel flow simulation...")
    print("Close the window to exit.")
    
    anim = visualizer.animate(
        total_frames=200,
        steps_per_frame=3,
        interval=30,
        show_velocity=True,
        show_pressure=True
    )
    
    visualizer.show()


if __name__ == '__main__':
    main()
