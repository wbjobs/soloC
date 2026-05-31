from .solver import FluidSolver, SolverBackend, BoundaryCondition, BoundaryType
from .visualization import FluidVisualizer
from .obstacles import (
    Obstacle,
    CircleObstacle,
    RectangleObstacle,
    EllipseObstacle,
    PolygonObstacle,
    ObstacleType,
    ObstacleBoundaryType,
    create_cylinder_grid,
    create_channel_blockage
)
from .vtk_export import (
    VTKExporter,
    export_to_vtk,
    create_paraview_state,
    write_readme
)

__version__ = '0.2.0'

__all__ = [
    'FluidSolver',
    'SolverBackend',
    'BoundaryCondition',
    'BoundaryType',
    'FluidVisualizer',
    'Obstacle',
    'CircleObstacle',
    'RectangleObstacle',
    'EllipseObstacle',
    'PolygonObstacle',
    'ObstacleType',
    'ObstacleBoundaryType',
    'create_cylinder_grid',
    'create_channel_blockage',
    'VTKExporter',
    'export_to_vtk',
    'create_paraview_state',
    'write_readme',
]
