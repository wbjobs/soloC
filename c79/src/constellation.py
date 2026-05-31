import numpy as np
from datetime import datetime, timedelta
from orbit_utils import create_satellite, calculate_ground_track
from scipy.spatial.distance import cdist

EARTH_RADIUS = 6378.137


class ConstellationAnalyzer:
    def __init__(self, max_satellites=10):
        self.max_satellites = max_satellites
        self.satellites = []
        self.satellite_data = []
        self.propagation_results = []
        
    def add_satellite(self, name, line1, line2):
        if len(self.satellites) >= self.max_satellites:
            return False, f"已达到最大卫星数量限制 ({self.max_satellites})"
        
        try:
            sat = create_satellite(line1, line2)
            self.satellites.append(sat)
            self.satellite_data.append({
                'name': name,
                'line1': line1,
                'line2': line2,
                'index': len(self.satellites) - 1
            })
            return True, f"成功添加卫星: {name}"
        except Exception as e:
            return False, f"添加卫星失败: {str(e)}"
    
    def clear_satellites(self):
        self.satellites = []
        self.satellite_data = []
        self.propagation_results = []
    
    def propagate_constellation(self, start_time=None, hours=24, step_minutes=5):
        if start_time is None:
            start_time = datetime.utcnow()
        
        self.propagation_results = []
        
        for i, sat in enumerate(self.satellites):
            result = calculate_ground_track(
                sat, start_time, hours=hours, step_minutes=step_minutes,
                enable_drag_correction=True
            )
            result['sat_index'] = i
            result['sat_name'] = self.satellite_data[i]['name']
            self.propagation_results.append(result)
        
        return self.propagation_results
    
    def check_inter_satellite_visibility(self, sat1_pos, sat2_pos, min_elevation=10):
        sat1 = np.array(sat1_pos)
        sat2 = np.array(sat2_pos)
        
        distance = np.linalg.norm(sat2 - sat1)
        
        sat1_alt = np.linalg.norm(sat1) - EARTH_RADIUS
        sat2_alt = np.linalg.norm(sat2) - EARTH_RADIUS
        
        mid_point = (sat1 + sat2) / 2
        mid_alt = np.linalg.norm(mid_point) - EARTH_RADIUS
        
        if mid_alt < 100:
            return False, distance
        
        vec1 = sat1 / np.linalg.norm(sat1)
        vec2 = sat2 / np.linalg.norm(sat2)
        angle = np.degrees(np.arccos(np.clip(np.dot(vec1, vec2), -1, 1)))
        
        if angle > 170:
            return False, distance
        
        return True, distance
    
    def calculate_inter_satellite_links(self, time_index=None, min_distance=100, max_distance=5000):
        if not self.propagation_results:
            return []
        
        if time_index is None:
            time_index = 0
        
        links = []
        positions = []
        
        for result in self.propagation_results:
            if time_index < len(result['positions']):
                positions.append(result['positions'][time_index])
            else:
                positions.append(None)
        
        n = len(self.satellites)
        for i in range(n):
            for j in range(i + 1, n):
                if positions[i] is not None and positions[j] is not None:
                    visible, distance = self.check_inter_satellite_visibility(
                        positions[i], positions[j]
                    )
                    if visible and min_distance <= distance <= max_distance:
                        links.append({
                            'sat1': i,
                            'sat2': j,
                            'sat1_name': self.satellite_data[i]['name'],
                            'sat2_name': self.satellite_data[j]['name'],
                            'distance': distance,
                            'pos1': positions[i],
                            'pos2': positions[j]
                        })
        
        return links
    
    def get_all_links_over_time(self, step_interval=1):
        if not self.propagation_results:
            return []
        
        num_times = len(self.propagation_results[0]['times'])
        all_links = []
        
        for t_idx in range(0, num_times, step_interval):
            links = self.calculate_inter_satellite_links(t_idx)
            all_links.append({
                'time_index': t_idx,
                'time': self.propagation_results[0]['times'][t_idx],
                'links': links,
                'link_count': len(links)
            })
        
        return all_links
    
    def calculate_revisit_time(self, target_lat, target_lon, ground_elevation=10):
        if not self.propagation_results:
            return None
        
        visibility_times = []
        num_times = len(self.propagation_results[0]['times'])
        
        for t_idx in range(num_times):
            for result in self.propagation_results:
                if t_idx < len(result['lats']):
                    sat_lat = result['lats'][t_idx]
                    sat_lon = result['lons'][t_idx]
                    sat_alt = result['alts'][t_idx]
                    
                    elevation = self._calculate_elevation(
                        target_lat, target_lon, 0,
                        sat_lat, sat_lon, sat_alt
                    )
                    
                    if elevation >= ground_elevation:
                        visibility_times.append({
                            'time': result['times'][t_idx],
                            'satellite': result['sat_name'],
                            'elevation': elevation
                        })
        
        visibility_times.sort(key=lambda x: x['time'])
        
        revisit_times = []
        for i in range(1, len(visibility_times)):
            delta = (visibility_times[i]['time'] - visibility_times[i-1]['time']).total_seconds() / 60
            revisit_times.append(delta)
        
        return {
            'visibility_events': visibility_times,
            'revisit_times': revisit_times,
            'mean_revisit': np.mean(revisit_times) if revisit_times else None,
            'median_revisit': np.median(revisit_times) if revisit_times else None,
            'min_revisit': np.min(revisit_times) if revisit_times else None,
            'max_revisit': np.max(revisit_times) if revisit_times else None,
            'total_visibility_count': len(visibility_times),
            'time_span_hours': (visibility_times[-1]['time'] - visibility_times[0]['time']).total_seconds() / 3600 if visibility_times else 0
        }
    
    def _calculate_elevation(self, obs_lat, obs_lon, obs_alt, sat_lat, sat_lon, sat_alt):
        obs_r = EARTH_RADIUS + obs_alt
        sat_r = EARTH_RADIUS + sat_alt
        
        obs_lat_rad = np.radians(obs_lat)
        obs_lon_rad = np.radians(obs_lon)
        sat_lat_rad = np.radians(sat_lat)
        sat_lon_rad = np.radians(sat_lon)
        
        obs_x = obs_r * np.cos(obs_lat_rad) * np.cos(obs_lon_rad)
        obs_y = obs_r * np.cos(obs_lat_rad) * np.sin(obs_lon_rad)
        obs_z = obs_r * np.sin(obs_lat_rad)
        
        sat_x = sat_r * np.cos(sat_lat_rad) * np.cos(sat_lon_rad)
        sat_y = sat_r * np.cos(sat_lat_rad) * np.sin(sat_lon_rad)
        sat_z = sat_r * np.sin(sat_lat_rad)
        
        obs_vec = np.array([obs_x, obs_y, obs_z])
        sat_vec = np.array([sat_x, sat_y, sat_z])
        
        range_vec = sat_vec - obs_vec
        range_dist = np.linalg.norm(range_vec)
        
        zenith = obs_vec / obs_r
        cos_zenith = np.dot(range_vec / range_dist, zenith)
        elevation = 90 - np.degrees(np.arccos(np.clip(cos_zenith, -1, 1)))
        
        return elevation
    
    def generate_constellation_report(self):
        report = []
        report.append("=" * 60)
        report.append("星座分析报告")
        report.append("=" * 60)
        report.append(f"卫星数量: {len(self.satellites)}/{self.max_satellites}")
        report.append("")
        
        if self.satellite_data:
            report.append("卫星列表:")
            for i, sat in enumerate(self.satellite_data, 1):
                report.append(f"  {i}. {sat['name']}")
            report.append("")
        
        report.append("=" * 60)
        
        return "\n".join(report)


def create_sample_constellation():
    sample_sats = [
        {
            'name': 'STARLINK-1007',
            'line1': '1 44713U 19074A   24001.50000000  .00010000  00000-0  10000-3 0  9999',
            'line2': '2 44713  53.0000  45.0000 0001000  90.0000 270.0000 15.05000000  1234'
        },
        {
            'name': 'STARLINK-1008',
            'line1': '1 44714U 19074B   24001.50000000  .00010000  00000-0  10000-3 0  9999',
            'line2': '2 44714  53.0000  81.0000 0001000  90.0000 270.0000 15.05000000  1234'
        },
        {
            'name': 'STARLINK-1009',
            'line1': '1 44715U 19074C   24001.50000000  .00010000  00000-0  10000-3 0  9999',
            'line2': '2 44715  53.0000 117.0000 0001000  90.0000 270.0000 15.05000000  1234'
        },
        {
            'name': 'STARLINK-1010',
            'line1': '1 44716U 19074D   24001.50000000  .00010000  00000-0  10000-3 0  9999',
            'line2': '2 44716  53.0000 153.0000 0001000  90.0000 270.0000 15.05000000  1234'
        },
        {
            'name': 'STARLINK-1011',
            'line1': '1 44717U 19074E   24001.50000000  .00010000  00000-0  10000-3 0  9999',
            'line2': '2 44717  53.0000 189.0000 0001000  90.0000 270.0000 15.05000000  1234'
        },
        {
            'name': 'STARLINK-1012',
            'line1': '1 44718U 19074F   24001.50000000  .00010000  00000-0  10000-3 0  9999',
            'line2': '2 44718  53.0000 225.0000 0001000  90.0000 270.0000 15.05000000  1234'
        },
        {
            'name': 'STARLINK-1013',
            'line1': '1 44719U 19074G   24001.50000000  .00010000  00000-0  10000-3 0  9999',
            'line2': '2 44719  53.0000 261.0000 0001000  90.0000 270.0000 15.05000000  1234'
        },
        {
            'name': 'STARLINK-1014',
            'line1': '1 44720U 19074H   24001.50000000  .00010000  00000-0  10000-3 0  9999',
            'line2': '2 44720  53.0000 297.0000 0001000  90.0000 270.0000 15.05000000  1234'
        },
        {
            'name': 'STARLINK-1015',
            'line1': '1 44721U 19074J   24001.50000000  .00010000  00000-0  10000-3 0  9999',
            'line2': '2 44721  53.0000 333.0000 0001000  90.0000 270.0000 15.05000000  1234'
        },
        {
            'name': 'STARLINK-1016',
            'line1': '1 44722U 19074K   24001.50000000  .00010000  00000-0  10000-3 0  9999',
            'line2': '2 44722  53.0000   9.0000 0001000  90.0000 270.0000 15.05000000  1234'
        }
    ]
    
    analyzer = ConstellationAnalyzer(max_satellites=10)
    for sat in sample_sats:
        analyzer.add_satellite(sat['name'], sat['line1'], sat['line2'])
    
    return analyzer
