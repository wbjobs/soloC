import numpy as np
import os
from typing import Optional, List, Tuple
from datetime import datetime


class VTKExporter:
    def __init__(
        self,
        output_dir: str = './vtk_output',
        prefix: str = 'fluid_data',
        file_type: str = 'vtk'
    ):
        self.output_dir = output_dir
        self.prefix = prefix
        self.file_type = file_type.lower()
        self._frame_counter = 0
        
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
    
    def write_frame(
        self,
        u: np.ndarray,
        v: np.ndarray,
        p: np.ndarray,
        dx: float = 1.0,
        dy: float = 1.0,
        time: float = 0.0,
        obstacle_mask: Optional[np.ndarray] = None,
        frame_index: Optional[int] = None
    ) -> str:
        if frame_index is None:
            frame_index = self._frame_counter
            self._frame_counter += 1
        
        filename = os.path.join(
            self.output_dir,
            f'{self.prefix}_{frame_index:06d}.vtk'
        )
        
        self._write_vtk_legacy(filename, u, v, p, dx, dy, time, obstacle_mask)
        
        return filename
    
    def _write_vtk_legacy(
        self,
        filename: str,
        u: np.ndarray,
        v: np.ndarray,
        p: np.ndarray,
        dx: float,
        dy: float,
        time: float,
        obstacle_mask: Optional[np.ndarray]
    ):
        ny, nx = u.shape
        
        with open(filename, 'w') as f:
            f.write('# vtk DataFile Version 3.0\n')
            f.write(f'Fluid Dynamics Simulation - Time: {time:.6f}\n')
            f.write('ASCII\n')
            f.write('DATASET STRUCTURED_POINTS\n')
            f.write(f'DIMENSIONS {nx} {ny} 1\n')
            f.write(f'ORIGIN 0.0 0.0 0.0\n')
            f.write(f'SPACING {dx} {dy} 1.0\n')
            f.write(f'POINT_DATA {nx * ny}\n')
            
            f.write('\nVECTORS velocity double\n')
            for j in range(ny):
                for i in range(nx):
                    f.write(f'{u[j, i]:.15e} {v[j, i]:.15e} 0.0\n')
            
            f.write('\nSCALARS pressure double\n')
            f.write('LOOKUP_TABLE default\n')
            for j in range(ny):
                for i in range(nx):
                    f.write(f'{p[j, i]:.15e}\n')
            
            vel_mag = np.sqrt(u ** 2 + v ** 2)
            f.write('\nSCALARS velocity_magnitude double\n')
            f.write('LOOKUP_TABLE default\n')
            for j in range(ny):
                for i in range(nx):
                    f.write(f'{vel_mag[j, i]:.15e}\n')
            
            if obstacle_mask is not None:
                f.write('\nSCALARS obstacle_mask int\n')
                f.write('LOOKUP_TABLE default\n')
                for j in range(ny):
                    for i in range(nx):
                        f.write(f'{1 if obstacle_mask[j, i] else 0}\n')
            
            f.write(f'\nFIELD FieldData 1\n')
            f.write('TIME 1 1 double\n')
            f.write(f'{time:.15e}\n')
    
    def write_pvd_file(
        self,
        time_steps: List[float],
        filenames: Optional[List[str]] = None
    ) -> str:
        if filenames is None:
            filenames = [
                os.path.join(self.output_dir, f'{self.prefix}_{i:06d}.vtk')
                for i in range(len(time_steps))
            ]
        
        pvd_filename = os.path.join(self.output_dir, f'{self.prefix}.pvd')
        
        with open(pvd_filename, 'w') as f:
            f.write('<?xml version="1.0"?>\n')
            f.write('<VTKFile type="Collection" version="0.1">\n')
            f.write('  <Collection>\n')
            
            for i, (time, filename) in enumerate(zip(time_steps, filenames)):
                rel_filename = os.path.basename(filename)
                f.write(f'    <DataSet timestep="{time:.6f}" group="" \n')
                f.write(f'             part="0" file="{rel_filename}"/>\n')
            
            f.write('  </Collection>\n')
            f.write('</VTKFile>\n')
        
        return pvd_filename
    
    def reset_counter(self):
        self._frame_counter = 0


def export_to_vtk(
    u: np.ndarray,
    v: np.ndarray,
    p: np.ndarray,
    filename: str,
    dx: float = 1.0,
    dy: float = 1.0,
    time: float = 0.0,
    obstacle_mask: Optional[np.ndarray] = None
) -> str:
    exporter = VTKExporter(
        output_dir=os.path.dirname(filename) or '.',
        prefix=os.path.splitext(os.path.basename(filename))[0]
    )
    
    return exporter.write_frame(
        u, v, p, dx, dy, time, obstacle_mask, frame_index=0
    )


def create_paraview_state(
    vtk_files: List[str],
    output_dir: str = './vtk_output'
) -> str:
    state_content = '''<?xml version="1.0"?>
<ServerManagerState>
  <ProxyGroup name="sources">
    <Proxy id="0" type="PVDReader">
      <Property name="FileName" id="0.FileName">
        <Element value="fluid_data.pvd"/>
      </Property>
      <Property name="PointArrayStatus">
        <Element value="velocity"/>
        <Element value="pressure"/>
        <Element value="velocity_magnitude"/>
      </Property>
    </Proxy>
  </ProxyGroup>
  
  <ProxyGroup name="views">
    <Proxy id="1" type="RenderView">
      <Property name="ViewSize" id="1.ViewSize">
        <Element value="1200"/>
        <Element value="800"/>
      </Property>
      <Property name="CameraPosition">
        <Element value="0"/>
        <Element value="0"/>
        <Element value="100"/>
      </Property>
      <Property name="CameraFocalPoint">
        <Element value="0"/>
        <Element value="0"/>
        <Element value="0"/>
      </Property>
    </Proxy>
  </ProxyGroup>
  
  <ProxyGroup name="representations">
    <Proxy id="2" type="SurfaceRepresentation">
      <Property name="Visibility" id="2.Visibility">
        <Element value="1"/>
      </Property>
      <Property name="Input">
        <Proxy id="0"/>
      </Property>
      <Property name="ColorArrayName">
        <Element value="velocity_magnitude"/>
      </Property>
    </Proxy>
  </ProxyGroup>
  
  <ProxyGroup name="lookuptables">
    <Proxy id="3" type="LookupTable">
      <Property name="NumberOfColors">
        <Element value="256"/>
      </Property>
      <Property name="RGBPoints">
        <Element value="0"/> <Element value="0.267004"/> <Element value="0.004874"/> <Element value="0.329415"/>
        <Element value="0.25"/> <Element value="0.190631"/> <Element value="0.407061"/> <Element value="0.556089"/>
        <Element value="0.5"/> <Element value="0.127568"/> <Element value="0.566949"/> <Element value="0.550556"/>
        <Element value="0.75"/> <Element value="0.369214"/> <Element value="0.788888"/> <Element value="0.382914"/>
        <Element value="1"/> <Element value="0.993248"/> <Element value="0.906157"/> <Element value="0.143936"/>
      </Property>
    </Proxy>
  </ProxyGroup>
</ServerManagerState>
'''
    
    state_filename = os.path.join(output_dir, 'fluid_visualization.pvsm')
    with open(state_filename, 'w') as f:
        f.write(state_content)
    
    return state_filename


def write_readme(output_dir: str = './vtk_output'):
    readme_content = '''ParaView 流体模拟数据导入指南
==================================

生成的文件：
- fluid_data_XXXXXX.vtk : 每个时间步的 VTK 数据文件
- fluid_data.pvd        : 时间序列集合文件
- fluid_visualization.pvsm : ParaView 状态文件（可选）

导入方法：

方法 1: 使用 PVD 文件（推荐）
1. 打开 ParaView
2. File -> Open
3. 选择 fluid_data.pvd
4. 点击 "Apply"
5. 点击播放按钮或拖动时间滑块查看动画

方法 2: 使用单帧 VTK 文件
1. File -> Open
2. 选择单个 .vtk 文件
3. 点击 "Apply"

可视化建议：
- 速度场：使用 Glyph 过滤器显示矢量
- 压力场：使用 Surface 渲染 + 颜色映射
- 障碍物：使用 Threshold 过滤器显示 obstacle_mask

数据字段说明：
- velocity : 速度矢量
- pressure : 压力标量
- velocity_magnitude : 速度大小
- obstacle_mask : 障碍物掩码（0=流体, 1=固体）
'''
    
    readme_filename = os.path.join(output_dir, 'README_ParaView.txt')
    with open(readme_filename, 'w') as f:
        f.write(readme_content)
    
    return readme_filename
