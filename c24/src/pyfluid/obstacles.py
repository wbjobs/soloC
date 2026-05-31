import numpy as np
from abc import ABC, abstractmethod
from typing import Tuple, Optional, List
from enum import Enum


class ObstacleType(Enum):
    CIRCLE = 'circle'
    RECTANGLE = 'rectangle'
    ELLIPSE = 'ellipse'
    POLYGON = 'polygon'


class ObstacleBoundaryType(Enum):
    NOSLIP = 'noslip'
    FREESLIP = 'freeslip'
    MOVING = 'moving'


class Obstacle(ABC):
    def __init__(
        self,
        name: str = 'obstacle',
        boundary_type: ObstacleBoundaryType = ObstacleBoundaryType.NOSLIP,
        u_velocity: float = 0.0,
        v_velocity: float = 0.0
    ):
        self.name = name
        self.boundary_type = boundary_type
        self.u_velocity = u_velocity
        self.v_velocity = v_velocity
    
    @abstractmethod
    def is_inside(self, x: float, y: float) -> bool:
        pass
    
    @abstractmethod
    def get_mask(self, nx: int, ny: int, dx: float, dy: float, 
                x_offset: float = 0.0, y_offset: float = 0.0) -> np.ndarray:
        pass
    
    @abstractmethod
    def to_dict(self) -> dict:
        pass


class CircleObstacle(Obstacle):
    def __init__(
        self,
        center: Tuple[float, float],
        radius: float,
        name: str = 'circle',
        boundary_type: ObstacleBoundaryType = ObstacleBoundaryType.NOSLIP,
        u_velocity: float = 0.0,
        v_velocity: float = 0.0
    ):
        super().__init__(name, boundary_type, u_velocity, v_velocity)
        self.center = center
        self.radius = radius
    
    def is_inside(self, x: float, y: float) -> bool:
        dx = x - self.center[0]
        dy = y - self.center[1]
        return dx * dx + dy * dy <= self.radius * self.radius
    
    def get_mask(self, nx: int, ny: int, dx: float, dy: float,
                x_offset: float = 0.0, y_offset: float = 0.0) -> np.ndarray:
        mask = np.zeros((ny, nx), dtype=bool)
        cx, cy = self.center
        
        for i in range(nx):
            x = x_offset + i * dx
            for j in range(ny):
                y = y_offset + j * dy
                dist_x = x - cx
                dist_y = y - cy
                if dist_x * dist_x + dist_y * dist_y <= self.radius * self.radius:
                    mask[j, i] = True
        
        return mask
    
    def to_dict(self) -> dict:
        return {
            'type': ObstacleType.CIRCLE.value,
            'name': self.name,
            'center': self.center,
            'radius': self.radius,
            'boundary_type': self.boundary_type.value,
            'u_velocity': self.u_velocity,
            'v_velocity': self.v_velocity
        }


class RectangleObstacle(Obstacle):
    def __init__(
        self,
        position: Tuple[float, float],
        width: float,
        height: float,
        name: str = 'rectangle',
        boundary_type: ObstacleBoundaryType = ObstacleBoundaryType.NOSLIP,
        u_velocity: float = 0.0,
        v_velocity: float = 0.0
    ):
        super().__init__(name, boundary_type, u_velocity, v_velocity)
        self.position = position
        self.width = width
        self.height = height
        self.x_min = position[0]
        self.x_max = position[0] + width
        self.y_min = position[1]
        self.y_max = position[1] + height
    
    def is_inside(self, x: float, y: float) -> bool:
        return (self.x_min <= x <= self.x_max and 
                self.y_min <= y <= self.y_max)
    
    def get_mask(self, nx: int, ny: int, dx: float, dy: float,
                x_offset: float = 0.0, y_offset: float = 0.0) -> np.ndarray:
        mask = np.zeros((ny, nx), dtype=bool)
        
        x_min = x_offset + self.x_min
        x_max = x_offset + self.x_max
        y_min = y_offset + self.y_min
        y_max = y_offset + self.y_max
        
        for i in range(nx):
            x = x_offset + i * dx
            for j in range(ny):
                y = y_offset + j * dy
                if x_min <= x <= x_max and y_min <= y <= y_max:
                    mask[j, i] = True
        
        return mask
    
    def to_dict(self) -> dict:
        return {
            'type': ObstacleType.RECTANGLE.value,
            'name': self.name,
            'position': self.position,
            'width': self.width,
            'height': self.height,
            'boundary_type': self.boundary_type.value,
            'u_velocity': self.u_velocity,
            'v_velocity': self.v_velocity
        }


class EllipseObstacle(Obstacle):
    def __init__(
        self,
        center: Tuple[float, float],
        radius_x: float,
        radius_y: float,
        angle: float = 0.0,
        name: str = 'ellipse',
        boundary_type: ObstacleBoundaryType = ObstacleBoundaryType.NOSLIP,
        u_velocity: float = 0.0,
        v_velocity: float = 0.0
    ):
        super().__init__(name, boundary_type, u_velocity, v_velocity)
        self.center = center
        self.radius_x = radius_x
        self.radius_y = radius_y
        self.angle = angle
        self.cos_angle = np.cos(angle)
        self.sin_angle = np.sin(angle)
    
    def is_inside(self, x: float, y: float) -> bool:
        dx = x - self.center[0]
        dy = y - self.center[1]
        
        x_rot = dx * self.cos_angle + dy * self.sin_angle
        y_rot = -dx * self.sin_angle + dy * self.cos_angle
        
        return (x_rot / self.radius_x) ** 2 + (y_rot / self.radius_y) ** 2 <= 1.0
    
    def get_mask(self, nx: int, ny: int, dx: float, dy: float,
                x_offset: float = 0.0, y_offset: float = 0.0) -> np.ndarray:
        mask = np.zeros((ny, nx), dtype=bool)
        cx, cy = self.center
        
        for i in range(nx):
            x = x_offset + i * dx
            for j in range(ny):
                y = y_offset + j * dy
                dx_val = x - cx
                dy_val = y - cy
                
                x_rot = dx_val * self.cos_angle + dy_val * self.sin_angle
                y_rot = -dx_val * self.sin_angle + dy_val * self.cos_angle
                
                if (x_rot / self.radius_x) ** 2 + (y_rot / self.radius_y) ** 2 <= 1.0:
                    mask[j, i] = True
        
        return mask
    
    def to_dict(self) -> dict:
        return {
            'type': ObstacleType.ELLIPSE.value,
            'name': self.name,
            'center': self.center,
            'radius_x': self.radius_x,
            'radius_y': self.radius_y,
            'angle': self.angle,
            'boundary_type': self.boundary_type.value,
            'u_velocity': self.u_velocity,
            'v_velocity': self.v_velocity
        }


class PolygonObstacle(Obstacle):
    def __init__(
        self,
        vertices: List[Tuple[float, float]],
        name: str = 'polygon',
        boundary_type: ObstacleBoundaryType = ObstacleBoundaryType.NOSLIP,
        u_velocity: float = 0.0,
        v_velocity: float = 0.0
    ):
        super().__init__(name, boundary_type, u_velocity, v_velocity)
        self.vertices = vertices
        self.n_vertices = len(vertices)
    
    def is_inside(self, x: float, y: float) -> bool:
        inside = False
        for i in range(self.n_vertices):
            j = (i + 1) % self.n_vertices
            vi_x, vi_y = self.vertices[i]
            vj_x, vj_y = self.vertices[j]
            
            if ((vi_y > y) != (vj_y > y)):
                slope = (vj_x - vi_x) / (vj_y - vi_y) if vj_y != vi_y else 0
                x_intersect = vi_x + (y - vi_y) * slope
                if x < x_intersect:
                    inside = not inside
        
        return inside
    
    def get_mask(self, nx: int, ny: int, dx: float, dy: float,
                x_offset: float = 0.0, y_offset: float = 0.0) -> np.ndarray:
        mask = np.zeros((ny, nx), dtype=bool)
        
        for i in range(nx):
            x = x_offset + i * dx
            for j in range(ny):
                y = y_offset + j * dy
                if self.is_inside(x, y):
                    mask[j, i] = True
        
        return mask
    
    def to_dict(self) -> dict:
        return {
            'type': ObstacleType.POLYGON.value,
            'name': self.name,
            'vertices': self.vertices,
            'boundary_type': self.boundary_type.value,
            'u_velocity': self.u_velocity,
            'v_velocity': self.v_velocity
        }


def create_cylinder_grid(
    nx: int, ny: int,
    n_cylinders_x: int = 3,
    n_cylinders_y: int = 2,
    radius: float = 2.0,
    spacing: float = 8.0,
    start_x: float = 20.0,
    start_y: float = 10.0,
    boundary_type: ObstacleBoundaryType = ObstacleBoundaryType.NOSLIP
) -> List[CircleObstacle]:
    obstacles = []
    for i in range(n_cylinders_x):
        for j in range(n_cylinders_y):
            cx = start_x + i * spacing
            cy = start_y + j * spacing
            obstacles.append(CircleObstacle(
                center=(cx, cy),
                radius=radius,
                name=f'cylinder_{i}_{j}',
                boundary_type=boundary_type
            ))
    return obstacles


def create_channel_blockage(
    channel_width: float,
    blockage_height: float = 0.3,
    position_x: float = 30.0,
    blockage_width: float = 5.0,
    boundary_type: ObstacleBoundaryType = ObstacleBoundaryType.NOSLIP
) -> List[RectangleObstacle]:
    bottom_height = channel_width * blockage_height
    top_height = channel_width * blockage_height
    middle_start = bottom_height
    middle_end = channel_width - top_height
    middle_height = middle_end - middle_start
    
    return [
        RectangleObstacle(
            position=(position_x, 0),
            width=blockage_width,
            height=bottom_height,
            name='blockage_bottom',
            boundary_type=boundary_type
        ),
        RectangleObstacle(
            position=(position_x, middle_end),
            width=blockage_width,
            height=top_height,
            name='blockage_top',
            boundary_type=boundary_type
        )
    ]
