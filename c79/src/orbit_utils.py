import numpy as np
from datetime import datetime, timedelta
from sgp4.api import Satrec, jday
from sgp4 import exporter
import requests
import pytz
from atmosphere import NRLMSISE00, AtmosphericDragCorrector, estimate_orbit_error


def get_tle_from_norad(norad_id):
    url = f"https://celestrak.com/NORAD/elements/gp.php?CATNR={norad_id}&FORMAT=TLE"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        lines = response.text.strip().split('\n')
        if len(lines) >= 3:
            name = lines[0].strip()
            line1 = lines[1].strip()
            line2 = lines[2].strip()
            return name, line1, line2
    except Exception as e:
        print(f"获取TLE失败: {e}")
    return None, None, None


def parse_tle_file(content):
    lines = content.strip().split('\n')
    satellites = []
    i = 0
    while i < len(lines):
        if i + 2 < len(lines):
            name = lines[i].strip()
            line1 = lines[i + 1].strip()
            line2 = lines[i + 2].strip()
            if len(line1) >= 69 and len(line2) >= 69:
                satellites.append({
                    'name': name,
                    'line1': line1,
                    'line2': line2
                })
            i += 3
        else:
            break
    return satellites


def create_satellite(line1, line2):
    return Satrec.twoline2rv(line1, line2)


def propagate_satellite_sgp4(sat, start_time, hours=168, step_minutes=15):
    positions = []
    velocities = []
    times = []
    total_steps = int((hours * 60) / step_minutes)
    
    for step in range(total_steps + 1):
        current_time = start_time + timedelta(minutes=step * step_minutes)
        jd, fr = jday(
            current_time.year, current_time.month, current_time.day,
            current_time.hour, current_time.minute, current_time.second
        )
        e, r, v = sat.sgp4(jd, fr)
        if e == 0:
            positions.append(r)
            velocities.append(v)
            times.append(current_time)
    
    return np.array(positions), np.array(velocities), np.array(times)


def propagate_satellite_with_drag_correction(sat, start_time, hours=168, step_minutes=1, 
                                              mass=1000, area=10, cd=2.2):
    corrector = AtmosphericDragCorrector(mass=mass, area=area, cd=cd)
    
    positions = []
    velocities = []
    times = []
    corrections = []
    
    total_steps = int((hours * 60) / step_minutes)
    
    current_pos = None
    current_vel = None
    
    for step in range(total_steps + 1):
        current_time = start_time + timedelta(minutes=step * step_minutes)
        jd, fr = jday(
            current_time.year, current_time.month, current_time.day,
            current_time.hour, current_time.minute, current_time.second
        )
        e, r, v = sat.sgp4(jd, fr)
        
        if e == 0:
            R = np.linalg.norm(r)
            alt = R - 6378.137
            
            if alt < 1000:
                lat = np.degrees(np.arcsin(r[2] / R))
                lon = np.degrees(np.arctan2(r[1], r[0]))
                corrected_pos, corrected_vel, drag_effect = corrector.correct_state(
                    np.array(r), np.array(v), current_time, lat, lon
                )
                positions.append(corrected_pos)
                velocities.append(corrected_vel)
                corrections.append(drag_effect)
            else:
                positions.append(np.array(r))
                velocities.append(np.array(v))
                corrections.append(0)
            
            times.append(current_time)
    
    total_correction = np.sum(corrections)
    
    return {
        'positions': np.array(positions),
        'velocities': np.array(velocities),
        'times': np.array(times),
        'corrections': np.array(corrections),
        'total_correction_km': total_correction,
        'corrector': corrector
    }


def propagate_satellite(sat, start_time, hours=168, step_minutes=15, enable_drag_correction=True,
                        mass=1000, area=10, cd=2.2):
    if enable_drag_correction:
        result = propagate_satellite_with_drag_correction(
            sat, start_time, hours, step_minutes, mass, area, cd
        )
        return result['positions'], result['times']
    else:
        positions, velocities, times = propagate_satellite_sgp4(sat, start_time, hours, step_minutes)
        return positions, times


def teme_to_geo(positions, times):
    lons = []
    lats = []
    alts = []
    
    for pos, t in zip(positions, times):
        jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute, t.second)
        gmst = exporter.gmst(jd + fr)
        theta = gmst * (np.pi / 12)
        
        x, y, z = pos
        r = np.sqrt(x**2 + y**2 + z**2)
        
        lon = np.degrees(np.arctan2(y, x) - theta)
        lon = ((lon + 180) % 360) - 180
        lat = np.degrees(np.arcsin(z / r))
        alt = r - 6378.137
        
        lons.append(lon)
        lats.append(lat)
        alts.append(alt)
    
    return np.array(lons), np.array(lats), np.array(alts)


def calculate_ground_track(sat, start_time, hours=168, step_minutes=15, 
                           enable_drag_correction=True, mass=1000, area=10, cd=2.2):
    if enable_drag_correction:
        result = propagate_satellite_with_drag_correction(
            sat, start_time, hours, step_minutes, mass, area, cd
        )
        positions = result['positions']
        times = result['times']
        total_correction = result['total_correction_km']
        corrector = result['corrector']
    else:
        positions, velocities, times = propagate_satellite_sgp4(sat, start_time, hours, step_minutes)
        total_correction = 0
        corrector = None
    
    lons, lats, alts = teme_to_geo(positions, times)
    
    mean_alt = np.mean(alts)
    error_est = estimate_orbit_error(mean_alt, days=hours/24)
    
    return {
        'times': times,
        'lons': lons,
        'lats': lats,
        'alts': alts,
        'positions': positions,
        'total_correction_km': total_correction,
        'drag_correction_enabled': enable_drag_correction,
        'error_estimate': error_est,
        'corrector': corrector
    }


def get_current_position(sat):
    now = datetime.utcnow()
    jd, fr = jday(now.year, now.month, now.day, now.hour, now.minute, now.second)
    e, r, v = sat.sgp4(jd, fr)
    if e == 0:
        lons, lats, alts = teme_to_geo([r], [now])
        return {
            'time': now,
            'position': r,
            'velocity': v,
            'lon': lons[0],
            'lat': lats[0],
            'alt': alts[0]
        }
    return None


def get_orbit_points(sat, num_points=200):
    now = datetime.utcnow()
    period = 2 * np.pi / sat.no
    positions = []
    
    for i in range(num_points):
        t = now + timedelta(minutes=(i / num_points) * period)
        jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute, t.second)
        e, r, v = sat.sgp4(jd, fr)
        if e == 0:
            positions.append(r)
    
    return np.array(positions)


def analyze_orbit_accuracy(sat, start_time=None, hours=168):
    if start_time is None:
        start_time = datetime.utcnow()
    
    result_with_correction = calculate_ground_track(
        sat, start_time, hours, step_minutes=15,
        enable_drag_correction=True
    )
    
    result_without_correction = calculate_ground_track(
        sat, start_time, hours, step_minutes=15,
        enable_drag_correction=False
    )
    
    pos_diff = result_with_correction['positions'] - result_without_correction['positions']
    diff_magnitudes = np.linalg.norm(pos_diff, axis=1)
    
    mean_alt = np.mean(result_with_correction['alts'])
    
    return {
        'mean_altitude_km': mean_alt,
        'max_position_difference_km': np.max(diff_magnitudes),
        'mean_position_difference_km': np.mean(diff_magnitudes),
        'total_correction_km': result_with_correction['total_correction_km'],
        'requires_correction': mean_alt < 500,
        'error_estimate': result_with_correction['error_estimate'],
        'correction_improves_accuracy': mean_alt < 1000
    }
