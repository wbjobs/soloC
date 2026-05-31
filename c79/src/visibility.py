import numpy as np
from datetime import datetime, timedelta
from sgp4.api import jday
from orbit_utils import propagate_satellite, teme_to_geo


def calculate_az_el(sat_pos, ground_pos):
    R = 6378.137
    
    sat_x, sat_y, sat_z = sat_pos
    gnd_lat, gnd_lon, gnd_alt = ground_pos
    
    gnd_lat_rad = np.radians(gnd_lat)
    gnd_lon_rad = np.radians(gnd_lon)
    
    gnd_x = (R + gnd_alt) * np.cos(gnd_lat_rad) * np.cos(gnd_lon_rad)
    gnd_y = (R + gnd_alt) * np.cos(gnd_lat_rad) * np.sin(gnd_lon_rad)
    gnd_z = (R + gnd_alt) * np.sin(gnd_lat_rad)
    
    rx = sat_x - gnd_x
    ry = sat_y - gnd_y
    rz = sat_z - gnd_z
    
    r = np.sqrt(rx**2 + ry**2 + rz**2)
    
    top_s = np.sin(gnd_lon_rad) * rx - np.cos(gnd_lon_rad) * ry
    top_e = np.sin(gnd_lat_rad) * np.cos(gnd_lon_rad) * rx + np.sin(gnd_lat_rad) * np.sin(gnd_lon_rad) * ry - np.cos(gnd_lat_rad) * rz
    top_z = np.cos(gnd_lat_rad) * np.cos(gnd_lon_rad) * rx + np.cos(gnd_lat_rad) * np.sin(gnd_lon_rad) * ry + np.sin(gnd_lat_rad) * rz
    
    az = np.degrees(np.arctan2(top_e, top_s))
    if az < 0:
        az += 360
    
    el = np.degrees(np.arcsin(top_z / r))
    
    return az, el, r


def calculate_visibility(sat, ground_lat, ground_lon, ground_alt=0, start_time=None, hours=168, min_elevation=10):
    if start_time is None:
        start_time = datetime.utcnow()
    
    positions, times = propagate_satellite(sat, start_time, hours, step_minutes=1)
    
    passes = []
    current_pass = None
    
    for i, (pos, t) in enumerate(zip(positions, times)):
        az, el, r = calculate_az_el(pos, (ground_lat, ground_lon, ground_alt))
        
        if el >= min_elevation:
            if current_pass is None:
                current_pass = {
                    'start_time': t,
                    'start_az': az,
                    'max_el': el,
                    'max_el_time': t,
                    'max_el_az': az,
                    'points': []
                }
            current_pass['points'].append({
                'time': t,
                'az': az,
                'el': el,
                'range': r
            })
            if el > current_pass['max_el']:
                current_pass['max_el'] = el
                current_pass['max_el_time'] = t
                current_pass['max_el_az'] = az
        else:
            if current_pass is not None:
                current_pass['end_time'] = t
                current_pass['end_az'] = az
                current_pass['duration'] = (current_pass['end_time'] - current_pass['start_time']).total_seconds() / 60
                passes.append(current_pass)
                current_pass = None
    
    if current_pass is not None:
        current_pass['end_time'] = times[-1]
        current_pass['end_az'] = az
        current_pass['duration'] = (current_pass['end_time'] - current_pass['start_time']).total_seconds() / 60
        passes.append(current_pass)
    
    return passes


def generate_ical(passes, sat_name, ground_lat, ground_lon):
    from icalendar import Calendar, Event
    import pytz
    
    cal = Calendar()
    cal.add('prodid', '-//Satellite Tracker//Satellite Visibility//EN')
    cal.add('version', '2.0')
    
    tz = pytz.UTC
    
    for i, pass_data in enumerate(passes):
        event = Event()
        event.add('summary', f'{sat_name} Pass #{i+1} (Max El: {pass_data["max_el"]:.1f}°)')
        event.add('dtstart', tz.localize(pass_data['start_time']))
        event.add('dtend', tz.localize(pass_data['end_time']))
        event.add('dtstamp', tz.localize(datetime.utcnow()))
        event.add('uid', f'sat-pass-{i}-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}@sattracker')
        
        description = (
            f'Satellite: {sat_name}\n'
            f'Start Time: {pass_data["start_time"].strftime("%Y-%m-%d %H:%M:%S UTC")}\n'
            f'Start Azimuth: {pass_data["start_az"]:.1f}°\n'
            f'Max Elevation: {pass_data["max_el"]:.1f}° at {pass_data["max_el_time"].strftime("%H:%M:%S")}\n'
            f'Max Elevation Azimuth: {pass_data["max_el_az"]:.1f}°\n'
            f'End Time: {pass_data["end_time"].strftime("%Y-%m-%d %H:%M:%S UTC")}\n'
            f'End Azimuth: {pass_data["end_az"]:.1f}°\n'
            f'Duration: {pass_data["duration"]:.1f} minutes\n'
            f'Ground Station: {ground_lat:.4f}°, {ground_lon:.4f}°'
        )
        event.add('description', description)
        
        cal.add_component(event)
    
    return cal.to_ical()
