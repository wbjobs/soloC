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
from pyfluid.visualization import create_vortex_initial_conditions


def main():
    nx, ny = 50, 50
    dx, dy = 1.0, 1.0
    dt = 0.01
    nu = 0.1
    
    print("Creating fluid solver with Numba backend...")
    try:
        solver = FluidSolver(nx, ny, dx, dy, dt, nu, backend=SolverBackend.NUMBA)
        print("Successfully created solver with Numba backend")
    except Exception as e:
        print(f"Numba backend not available, falling back to NumPy: {e}")
        solver = FluidSolver(nx, ny, dx, dy, dt, nu, backend=SolverBackend.NUMPY)
    
    print("Setting initial vortex conditions...")
    u0, v0, p0 = create_vortex_initial_conditions(nx, ny, strength=2.0)
    solver.set_initial_conditions(u0, v0, p0)
    
    print("Setting boundary conditions (all no-slip)...")
    bc_noslip = BoundaryCondition(type=BoundaryType.NOSLIP)
    solver.set_boundary_conditions(
        left=bc_noslip,
        right=bc_noslip,
        top=bc_noslip,
        bottom=bc_noslip
    )
    
    print("Creating visualizer...")
    visualizer = FluidVisualizer(solver)
    
    print("Running simulation animation...")
    print("Close the window to exit.")
    
    anim = visualizer.animate(
        total_frames=100,
        steps_per_frame=5,
        interval=50,
        show_velocity=True,
        show_pressure=True
    )
    
    visualizer.show()


if __name__ == '__main__':
    main()
