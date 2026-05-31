import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from pyfluid import (
    FluidSolver,
    FluidVisualizer,
    BoundaryCondition,
    BoundaryType,
    SolverBackend,
    CircleObstacle,
    ObstacleBoundaryType,
    VTKExporter,
    write_readme
)


def main():
    nx, ny = 120, 60
    dx, dy = 1.0, 1.0
    dt = 0.005
    nu = 0.01
    inflow_velocity = 1.0
    
    print("Creating fluid solver for flow past cylinder...")
    try:
        solver = FluidSolver(nx, ny, dx, dy, dt, nu, backend=SolverBackend.NUMBA)
        print("Using Numba backend")
    except Exception as e:
        print(f"Numba not available, using NumPy backend: {e}")
        solver = FluidSolver(nx, ny, dx, dy, dt, nu, backend=SolverBackend.NUMPY)
    
    print("Setting initial conditions...")
    u0 = np.ones((ny, nx)) * inflow_velocity
    v0 = np.zeros((ny, nx))
    solver.set_initial_conditions(u0, v0)
    
    print("Adding circular cylinder obstacle...")
    cylinder = CircleObstacle(
        center=(30.0, 29.5),
        radius=5.0,
        name='cylinder',
        boundary_type=ObstacleBoundaryType.NOSLIP
    )
    solver.add_obstacle(cylinder)
    
    print("Setting boundary conditions:")
    print("  - Left: Inflow (u=1.0, v=0.0)")
    print("  - Right: Outflow")
    print("  - Top/Bottom: No-slip")
    
    bc_inflow = BoundaryCondition(
        type=BoundaryType.INFLOW,
        u_value=inflow_velocity,
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
    
    print("\nCreating visualizer...")
    visualizer = FluidVisualizer(solver, figsize=(14, 6))
    
    print("Running flow past cylinder simulation...")
    print("Close the window to exit.")
    
    anim = visualizer.animate(
        total_frames=300,
        steps_per_frame=5,
        interval=30,
        show_velocity=True,
        show_pressure=True
    )
    
    visualizer.show()


if __name__ == '__main__':
    main()
