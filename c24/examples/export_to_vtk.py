import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from pyfluid import (
    FluidSolver,
    BoundaryCondition,
    BoundaryType,
    SolverBackend,
    CircleObstacle,
    RectangleObstacle,
    ObstacleBoundaryType,
    VTKExporter,
    create_paraview_state,
    write_readme
)


def main():
    nx, ny = 80, 40
    dx, dy = 1.0, 1.0
    dt = 0.005
    nu = 0.01
    inflow_velocity = 1.0
    
    print("=" * 60)
    print("VTK Export Example")
    print("=" * 60)
    
    print("\nCreating fluid solver...")
    try:
        solver = FluidSolver(nx, ny, dx, dy, dt, nu, backend=SolverBackend.NUMBA)
        print("  Using Numba backend")
    except Exception as e:
        print(f"  Numba not available, using NumPy backend: {e}")
        solver = FluidSolver(nx, ny, dx, dy, dt, nu, backend=SolverBackend.NUMPY)
    
    print("\nSetting up channel flow with multiple obstacles...")
    u0 = np.ones((ny, nx)) * inflow_velocity
    v0 = np.zeros((ny, nx))
    solver.set_initial_conditions(u0, v0)
    
    print("Adding obstacles:")
    
    cylinder = CircleObstacle(
        center=(20.0, 19.5),
        radius=3.0,
        name='cylinder_1',
        boundary_type=ObstacleBoundaryType.NOSLIP
    )
    solver.add_obstacle(cylinder)
    print(f"  - Cylinder at (20, 19.5), radius=3.0")
    
    block = RectangleObstacle(
        position=(40.0, 15.0),
        width=5.0,
        height=10.0,
        name='rectangle_1',
        boundary_type=ObstacleBoundaryType.NOSLIP
    )
    solver.add_obstacle(block)
    print(f"  - Rectangle at (40, 15), 5x10")
    
    print(f"\nTotal obstacles: {len(solver.obstacles)}")
    print(f"Obstacle cells: {np.sum(solver.obstacle_mask)}")
    
    print("\nSetting boundary conditions...")
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
    
    output_dir = os.path.join(os.path.dirname(__file__), '..', 'vtk_output')
    print(f"\nOutput directory: {os.path.abspath(output_dir)}")
    
    exporter = VTKExporter(
        output_dir=output_dir,
        prefix='channel_flow'
    )
    
    total_frames = 50
    steps_per_frame = 10
    time_steps = []
    current_time = 0.0
    
    print(f"\nRunning simulation and exporting VTK files...")
    print(f"  Total frames: {total_frames}")
    print(f"  Steps per frame: {steps_per_frame}")
    
    for frame in range(total_frames):
        solver.run(steps_per_frame)
        current_time += steps_per_frame * dt
        time_steps.append(current_time)
        
        u, v, p = solver.get_state()
        obstacle_mask = solver.get_obstacle_mask()
        
        filename = exporter.write_frame(
            u, v, p,
            dx=dx, dy=dy,
            time=current_time,
            obstacle_mask=obstacle_mask
        )
        
        if frame % 10 == 0:
            u_max = np.max(np.abs(u))
            print(f"  Frame {frame:4d}/{total_frames}: time={current_time:.3f}s, |u|_max={u_max:.4f}")
    
    print(f"\nCreating ParaView PVD file...")
    pvd_file = exporter.write_pvd_file(time_steps)
    print(f"  Created: {pvd_file}")
    
    print(f"\nCreating ParaView state file and README...")
    state_file = create_paraview_state([], output_dir=output_dir)
    readme_file = write_readme(output_dir=output_dir)
    print(f"  Created: {state_file}")
    print(f"  Created: {readme_file}")
    
    print("\n" + "=" * 60)
    print("VTK Export Complete!")
    print("=" * 60)
    print("\nTo view in ParaView:")
    print("  1. Open ParaView")
    print("  2. File -> Open")
    print(f"  3. Select: {os.path.abspath(pvd_file)}")
    print("  4. Click 'Apply'")
    print("  5. Use the animation controls to play")
    print("\nData fields available:")
    print("  - velocity: velocity vector (use Glyph filter)")
    print("  - pressure: pressure scalar")
    print("  - velocity_magnitude: speed")
    print("  - obstacle_mask: solid obstacles (0=fluid, 1=solid)")


if __name__ == '__main__':
    main()
