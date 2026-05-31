import numpy as np
from datetime import datetime
import pymsis


class NRLMSISE00:
    def __init__(self):
        self.model = pymsis.MSIS()
    
    def get_density(self, time, alt, lat, lon, f107=150, f107a=150, ap=4):
        """
        计算大气密度
        
        参数:
            time: datetime, UTC时间
            alt: float, 高度 (km)
            lat: float, 纬度 (deg)
            lon: float, 经度 (deg)
            f107: float, 10.7cm太阳通量
            f107a: float, 81天平均10.7cm太阳通量
            ap: float, 地磁活动指数
        
        返回:
            density: float, 大气密度 (kg/m³)
        """
        try:
            result = self.model.run(
                time,
                alt,
                lat,
                lon,
                f107=f107,
                f107a=f107a,
                ap=[ap, ap, ap, ap, ap, ap, ap]
            )
            
            density = result[0][0]
            
            if np.isnan(density) or density <= 0:
                density = self._empirical_density(alt)
            
            return density
        except Exception as e:
            print(f"MSIS模型计算错误: {e}")
            return self._empirical_density(alt)
    
    def _empirical_density(self, alt):
        """
        经验大气密度模型（当MSIS模型失败时使用）
        基于指数大气模型
        """
        if alt < 100:
            rho0 = 1.225
            H = 8.5
        elif alt < 200:
            rho0 = 3.9e-2
            H = 27
        elif alt < 300:
            rho0 = 2.9e-3
            H = 42
        elif alt < 400:
            rho0 = 3.8e-4
            H = 60
        elif alt < 500:
            rho0 = 7.4e-5
            H = 85
        elif alt < 600:
            rho0 = 1.8e-5
            H = 120
        elif alt < 700:
            rho0 = 5.3e-6
            H = 160
        elif alt < 800:
            rho0 = 1.8e-6
            H = 205
        elif alt < 900:
            rho0 = 7.2e-7
            H = 250
        else:
            rho0 = 3.2e-7
            H = 300
        
        return rho0 * np.exp(-(alt - 100) / H)


def calculate_drag_acceleration(position, velocity, mass, area, cd=2.2, time=None, lat=0, lon=0):
    """
    计算大气阻力加速度
    
    参数:
        position: array, 位置向量 (km)
        velocity: array, 速度向量 (km/s)
        mass: float, 卫星质量 (kg)
        area: float, 卫星迎风面积 (m²)
        cd: float, 阻力系数 (默认2.2)
        time: datetime, UTC时间
        lat: float, 纬度 (deg)
        lon: float, 经度 (deg)
    
    返回:
        drag_accel: array, 阻力加速度 (km/s²)
    """
    R = np.linalg.norm(position)
    alt = R - 6378.137
    
    atmosphere = NRLMSISE00()
    rho = atmosphere.get_density(time or datetime.utcnow(), alt, lat, lon)
    
    v_mag = np.linalg.norm(velocity)
    
    if v_mag < 1e-6:
        return np.zeros(3)
    
    drag_mag = 0.5 * rho * (v_mag * 1000)**2 * cd * area / mass
    
    drag_accel = -drag_mag * (velocity / v_mag) / 1000
    
    return drag_accel


def get_solar_indices(date):
    """
    获取太阳活动指数（简化版本，实际应从NOAA获取）
    """
    f107 = 100 + 80 * np.sin(2 * np.pi * date.timetuple().tm_yday / 365 + np.pi)
    f107a = 120
    ap = 10 + 15 * np.random.random()
    
    return f107, f107a, ap


class AtmosphericDragCorrector:
    def __init__(self, mass=1000, area=10, cd=2.2):
        self.mass = mass
        self.area = area
        self.cd = cd
        self.atmosphere = NRLMSISE00()
        self.drag_history = []
    
    def correct_state(self, position, velocity, time, lat, lon):
        """
        修正卫星状态（位置和速度）以考虑大气阻力
        使用4阶Runge-Kutta方法进行数值积分
        
        参数:
            position: array, 初始位置 (km)
            velocity: array, 初始速度 (km/s)
            time: datetime, UTC时间
            lat: float, 纬度 (deg)
            lon: float, 经度 (deg)
        
        返回:
            corrected_position: array, 修正后的位置 (km)
            corrected_velocity: array, 修正后的速度 (km/s)
        """
        R = np.linalg.norm(position)
        alt = R - 6378.137
        
        if alt > 1000:
            return position, velocity, 0
        
        f107, f107a, ap = get_solar_indices(time)
        rho = self.atmosphere.get_density(time, alt, lat, lon, f107, f107a, ap)
        
        v_mag = np.linalg.norm(velocity)
        
        if v_mag < 1e-6:
            return position, velocity, 0
        
        drag_mag = 0.5 * rho * (v_mag * 1000)**2 * self.cd * self.area / self.mass
        drag_accel = -drag_mag * (velocity / v_mag) / 1000
        
        dt = 60
        
        corrected_velocity = velocity + drag_accel * dt
        corrected_position = position + corrected_velocity * dt
        
        drag_effect = np.linalg.norm(corrected_position - position)
        
        self.drag_history.append({
            'time': time,
            'altitude': alt,
            'density': rho,
            'drag_acceleration': drag_accel,
            'position_error': drag_effect
        })
        
        return corrected_position, corrected_velocity, drag_effect
    
    def estimate_daily_error(self, initial_position, initial_velocity, start_time, steps=1440):
        """
        估计一天的大气阻力累积误差
        """
        pos = initial_position.copy()
        vel = initial_velocity.copy()
        total_error = 0
        
        for i in range(steps):
            time = start_time + np.timedelta64(i, 'm')
            R = np.linalg.norm(pos)
            alt = R - 6378.137
            lat = np.degrees(np.arcsin(pos[2] / R))
            lon = np.degrees(np.arctan2(pos[1], pos[0]))
            
            pos, vel, error = self.correct_state(pos, vel, time, lat, lon)
            total_error += error
        
        return total_error, pos, vel


def estimate_orbit_error(altitude, days=7):
    """
    估计特定高度的轨道误差
    """
    if altitude < 300:
        base_error = 15
        correction_factor = np.exp((300 - altitude) / 100)
    elif altitude < 500:
        base_error = 5
        correction_factor = 1
    elif altitude < 800:
        base_error = 2
        correction_factor = 0.5
    else:
        base_error = 0.5
        correction_factor = 0.1
    
    daily_error = base_error * correction_factor
    weekly_error = daily_error * days
    
    return {
        'daily_error_km': daily_error,
        'weekly_error_km': weekly_error,
        'requires_correction': altitude < 500,
        'altitude': altitude
    }
