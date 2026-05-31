import numpy as np
import matplotlib
matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.artist import Artist
from typing import Optional, Tuple, List, Callable, Dict
import time


class FluidVisualizer:
    def __init__(self, solver, figsize: Tuple[int, int] = (12, 5)):
        self.solver = solver
        self.figsize = figsize
        self.fig = None
        self.axes = None
        self.artists: Dict[str, Dict] = {}
        self._show_velocity = True
        self._show_pressure = True
        self._frame_times: List[float] = []
        self._fps_text = None
        
        self._setup_grid()
    
    def _setup_grid(self):
        nx, ny = self.solver.nx, self.solver.ny
        self._x = np.linspace(0, (nx - 1) * self.solver.dx, nx)
        self._y = np.linspace(0, (ny - 1) * self.solver.dy, ny)
        self._X, self._Y = np.meshgrid(self._x, self._y)
        self._skip = max(1, min(nx, ny) // 10)
    
    def create_figure(self, show_velocity: bool = True, show_pressure: bool = True) -> None:
        self._show_velocity = show_velocity
        self._show_pressure = show_pressure
        
        num_plots = sum([show_velocity, show_pressure])
        if num_plots == 0:
            raise ValueError("At least one of show_velocity or show_pressure must be True")
        
        plt.style.use('fast')
        self.fig, self.axes = plt.subplots(1, num_plots, figsize=self.figsize)
        if num_plots == 1:
            self.axes = [self.axes]
        
        plot_idx = 0
        if show_velocity:
            self._setup_velocity_plot(self.axes[plot_idx])
            plot_idx += 1
        if show_pressure:
            self._setup_pressure_plot(self.axes[plot_idx])
        
        self._fps_text = self.fig.text(0.01, 0.01, 'FPS: 0', fontsize=10, alpha=0.7)
        plt.tight_layout()
        self.fig.canvas.draw()
    
    def _setup_velocity_plot(self, ax) -> None:
        vel_mag = self.solver.get_velocity_magnitude()
        self._v_min = 0
        self._v_max = max(np.max(vel_mag), 0.01)
        
        im = ax.pcolormesh(
            self._X, self._Y, vel_mag,
            cmap='viridis', shading='auto',
            vmin=self._v_min, vmax=self._v_max
        )
        cbar = self.fig.colorbar(im, ax=ax, label='|V|')
        
        X_quiv = self._X[::self._skip, ::self._skip]
        Y_quiv = self._Y[::self._skip, ::self._skip]
        u_quiv = self.solver.u[::self._skip, ::self._skip]
        v_quiv = self.solver.v[::self._skip, ::self._skip]
        
        quiver = ax.quiver(
            X_quiv, Y_quiv, u_quiv, v_quiv,
            color='white', scale=50, alpha=0.7,
            pivot='mid'
        )
        
        ax.set_title('Velocity Field')
        ax.set_xlabel('x')
        ax.set_ylabel('y')
        ax.set_aspect('equal')
        
        self.artists['velocity'] = {
            'im': im,
            'quiver': quiver,
            'cbar': cbar,
            'ax': ax
        }
    
    def _setup_pressure_plot(self, ax) -> None:
        p = self.solver.p
        p_min, p_max = np.min(p), np.max(p)
        p_range = max(p_max - p_min, 0.01)
        
        self._p_min = p_min - 0.1 * p_range
        self._p_max = p_max + 0.1 * p_range
        
        im = ax.pcolormesh(
            self._X, self._Y, p,
            cmap='coolwarm', shading='auto',
            vmin=self._p_min, vmax=self._p_max
        )
        cbar = self.fig.colorbar(im, ax=ax, label='Pressure')
        
        ax.set_title('Pressure Field')
        ax.set_xlabel('x')
        ax.set_ylabel('y')
        ax.set_aspect('equal')
        
        self.artists['pressure'] = {
            'im': im,
            'cbar': cbar,
            'ax': ax
        }
    
    def update(self) -> List[Artist]:
        t_start = time.time()
        
        updated_artists: List[Artist] = []
        
        if 'velocity' in self.artists:
            v_art = self.artists['velocity']
            vel_mag = self.solver.get_velocity_magnitude()
            
            v_art['im'].set_array(vel_mag.ravel())
            
            u_quiv = self.solver.u[::self._skip, ::self._skip]
            v_quiv = self.solver.v[::self._skip, ::self._skip]
            v_art['quiver'].set_UVC(u_quiv, v_quiv)
            
            updated_artists.extend([v_art['im'], v_art['quiver']])
        
        if 'pressure' in self.artists:
            p_art = self.artists['pressure']
            p_art['im'].set_array(self.solver.p.ravel())
            updated_artists.append(p_art['im'])
        
        if self._fps_text:
            frame_time = time.time() - t_start
            self._frame_times.append(frame_time)
            if len(self._frame_times) > 30:
                self._frame_times.pop(0)
            
            avg_time = np.mean(self._frame_times)
            fps = 1.0 / avg_time if avg_time > 0 else 0
            self._fps_text.set_text(f'FPS: {fps:.1f}')
            updated_artists.append(self._fps_text)
        
        return updated_artists
    
    def animate(
        self,
        total_frames: int,
        steps_per_frame: int = 1,
        interval: int = 30,
        show_velocity: bool = True,
        show_pressure: bool = True,
        callback: Optional[Callable[[int], None]] = None
    ) -> FuncAnimation:
        self.create_figure(show_velocity, show_pressure)
        
        def update_frame(frame):
            self.solver.run(steps_per_frame)
            
            if callback:
                callback(frame)
            
            updated = self.update()
            return updated
        
        anim = FuncAnimation(
            self.fig,
            update_frame,
            frames=total_frames,
            interval=interval,
            blit=True,
            repeat=True,
            cache_frame_data=False
        )
        
        return anim
    
    def show(self, block: bool = True) -> None:
        plt.show(block=block)
    
    def save(
        self,
        filename: str,
        total_frames: int,
        steps_per_frame: int = 1,
        fps: int = 30,
        show_velocity: bool = True,
        show_pressure: bool = True,
        writer: str = 'ffmpeg',
        dpi: int = 100
    ) -> None:
        anim = self.animate(
            total_frames=total_frames,
            steps_per_frame=steps_per_frame,
            interval=1000 // fps,
            show_velocity=show_velocity,
            show_pressure=show_pressure
        )
        
        anim.save(filename, writer=writer, fps=fps, dpi=dpi, bitrate=2000)
    
    def plot_frame(self, show_velocity: bool = True, show_pressure: bool = True) -> None:
        self.create_figure(show_velocity, show_pressure)
        self.update()
        self.show()


def create_vortex_initial_conditions(nx: int, ny: int, strength: float = 1.0):
    x = np.linspace(-1, 1, nx)
    y = np.linspace(-1, 1, ny)
    X, Y = np.meshgrid(x, y)
    
    cx, cy = 0.0, 0.0
    r = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
    theta = np.arctan2(Y - cy, X - cx)
    
    u = -strength * (Y - cy) * np.exp(-r ** 2 / 0.1)
    v = strength * (X - cx) * np.exp(-r ** 2 / 0.1)
    p = np.zeros((ny, nx))
    
    return u, v, p


def create_channel_flow_initial_conditions(
    nx: int,
    ny: int,
    max_velocity: float = 1.0
):
    u = np.zeros((ny, nx))
    v = np.zeros((ny, nx))
    p = np.zeros((ny, nx))
    
    for j in range(ny):
        y = j / (ny - 1)
        u[j, :] = max_velocity * 4 * y * (1 - y)
    
    return u, v, p


def create_double_vortex_initial_conditions(nx: int, ny: int, strength: float = 1.0):
    x = np.linspace(-1, 1, nx)
    y = np.linspace(-1, 1, ny)
    X, Y = np.meshgrid(x, y)
    
    u = np.zeros_like(X)
    v = np.zeros_like(Y)
    
    centers = [(-0.3, 0.0), (0.3, 0.0)]
    for i, (cx, cy) in enumerate(centers):
        sign = 1 if i == 0 else -1
        r = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
        u += sign * strength * (Y - cy) * np.exp(-r ** 2 / 0.05)
        v -= sign * strength * (X - cx) * np.exp(-r ** 2 / 0.05)
    
    p = np.zeros((ny, nx))
    return u, v, p
