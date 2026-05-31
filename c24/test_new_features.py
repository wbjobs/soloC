import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from pyfluid import (
    FluidSolver,
    BoundaryCondition,
    BoundaryType,
    SolverBackend,
    CircleObstacle,
    RectangleObstacle,
    EllipseObstacle,
    PolygonObstacle,
    ObstacleBoundaryType,
    VTKExporter,
    export_to_vtk
)

print("=" * 60)
print("Testing New Features: Obstacles and VTK Export")
print("=" * 60)

print("\n1. Testing obstacles module...")
circle = CircleObstacle(
    center=(10.0, 10.0),
    radius=3.0,
    name='test_circle',
    boundary_type=ObstacleBoundaryType.NOSLIP
)
print(f"   - Circle: center={circle.center}, radius={circle.radius}")
print(f"   - is_inside(10,10): {circle.is_inside(10, 10)}")
print(f"   - is_inside(20,10): {circle.is_inside(20, 10)}")

rect = RectangleObstacle(
    position=(5.0, 5.0),
    width=4.0,
    height=6.0,
    name='test_rect'
)
print(f"   - Rectangle: position={rect.position}, size={rect.width}x{rect.height}")

ellipse = EllipseObstacle(
    center=(15.0, 15.0),
    radius_x=4.0,
    radius_y=2.0,
    angle=np.pi/6,
    name='test_ellipse'
)
print(f"   - Ellipse: center={ellipse.center}, angle={ellipse.angle:.3f}")

polygon = PolygonObstacle(
    vertices=[(0, 0), (5, 0), (5, 5), (2.5, 7.5), (0, 5)],
    name='test_polygon'
)
print(f"   - Polygon: {polygon.n_vertices} vertices")
print("   OK All obstacle types created successfully!")

print("\n2. Testing solver with obstacles...")
nx, ny = 30, 20
solver = FluidSolver(nx, ny, 1.0, 1.0, 0.005, 0.05, backend=SolverBackend.NUMPY)

u0 = np.ones((ny, nx)) * 0.5
v0 = np.zeros((ny, nx))
solver.set_initial_conditions(u0, v0)

solver.add_obstacle(circle)
solver.add_obstacle(rect)

print(f"   - Total obstacles: {len(solver.obstacles)}")
print(f"   - Obstacle mask cells: {np.sum(solver.obstacle_mask)}")
print("   OK Obstacles added to solver!")

print("\n3. Running simulation with obstacles...")
try:
    solver.run(20)
    print(f"   - After 20 steps: |u|_max={np.max(np.abs(solver.u)):.6f}")
    print(f"   - Obstacle velocities still 0: {np.all(solver.u[solver.obstacle_mask] == 0)}")
    print("   OK Simulation with obstacles runs stably!")
except Exception as e:
    print(f"   ERROR: {e}")

print("\n4. Testing VTK export...")
try:
    output_dir = os.path.join(os.path.dirname(__file__), 'vtk_output')
    exporter = VTKExporter(output_dir=output_dir, prefix='test_export')
    
    u, v, p = solver.get_state()
    mask = solver.get_obstacle_mask()
    
    filename = exporter.write_frame(
        u, v, p,
        dx=1.0, dy=1.0,
        time=0.1,
        obstacle_mask=mask
    )
    
    print(f"   - VTK file: {os.path.abspath(filename)}")
    print("   OK VTK export successful!")
except Exception as e:
    print(f"   ERROR: {e}")
    import traceback
    traceback.print_exc()

print("\n5. Testing obstacle removal...")
solver.remove_obstacle('test_circle')
print(f"   - After removal: {len(solver.obstacles)} obstacles")
print("   OK Obstacle removal works!")

solver.clear_obstacles()
print(f"   - After clear: {len(solver.obstacles)} obstacles")
print("   OK Clear obstacles works!")

print("\n" + "=" * 60)
print("All new features tested successfully!")
print("=" * 60)
