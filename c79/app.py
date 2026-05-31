import dash
from dash import dcc, html, Input, Output, State, callback_context
import dash_bootstrap_components as dbc
import plotly.graph_objects as go
import numpy as np
from datetime import datetime
import base64
import io

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from orbit_utils import (
    get_tle_from_norad, parse_tle_file, create_satellite,
    calculate_ground_track, get_current_position, get_orbit_points,
    analyze_orbit_accuracy
)
from visibility import calculate_visibility, generate_ical

app = dash.Dash(__name__, external_stylesheets=[dbc.themes.DARKLY])
server = app.server

satellite_data = None
ground_track_data = None
visibility_passes = None

app.layout = dbc.Container([
    html.H1("卫星轨道分析与可视化", className="text-center my-4"),
    
    dbc.Row([
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("卫星数据输入"),
                dbc.CardBody([
                    dbc.InputGroup([
                        dbc.Input(id="norad-input", placeholder="输入NORAD ID (例如: 25544)", type="text"),
                        dbc.Button("获取TLE", id="get-tle-btn", color="primary")
                    ], className="mb-3"),
                    html.Div(className="text-center mb-3", children="或"),
                    dcc.Upload(
                        id='tle-upload',
                        children=html.Div([
                            '拖拽TLE文件到此处 或 ',
                            html.A('点击选择文件')
                        ]),
                        style={
                            'width': '100%',
                            'height': '60px',
                            'lineHeight': '60px',
                            'borderWidth': '1px',
                            'borderStyle': 'dashed',
                            'borderRadius': '5px',
                            'textAlign': 'center',
                            'margin': '10px 0'
                        },
                        multiple=False
                    ),
                    html.Div(id="satellite-info", className="mt-3")
                ])
            ])
        ], md=4),
        
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("地面站设置"),
                dbc.CardBody([
                    dbc.Row([
                        dbc.Col([
                            dbc.Label("纬度 (°)"),
                            dbc.Input(id="lat-input", placeholder="例如: 39.9042", type="number", value=39.9042)
                        ]),
                        dbc.Col([
                            dbc.Label("经度 (°)"),
                            dbc.Input(id="lon-input", placeholder="例如: 116.4074", type="number", value=116.4074)
                        ])
                    ]),
                    dbc.Row([
                        dbc.Col([
                            dbc.Label("最小仰角 (°)"),
                            dbc.Input(id="min-el-input", type="number", value=10, min=0, max=90)
                        ]),
                        dbc.Col([
                            dbc.Button("计算可见性", id="calc-visibility-btn", color="success", className="mt-4 w-100")
                        ])
                    ])
                ])
            ])
        ], md=8)
    ], className="mb-4"),
    
    dbc.Row([
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("卫星地面轨迹 (Mapbox)"),
                dbc.CardBody([
                    dcc.Graph(id="ground-track-map", style={"height": "500px"})
                ])
            ])
        ], md=12)
    ], className="mb-4"),
    
    dbc.Row([
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("3D 轨道可视化"),
                dbc.CardBody([
                    html.Div([
                        html.Iframe(
                            id="3d-orbit-view",
                            srcDoc="",
                            style={"width": "100%", "height": "600px", "border": "none"}
                        )
                    ])
                ])
            ])
        ], md=12)
    ], className="mb-4"),
    
    dbc.Row([
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("轨道精度分析"),
                dbc.CardBody([
                    html.Div(id="accuracy-info")
                ])
            ])
        ], md=12)
    ], className="mb-4"),
    
    dbc.Row([
        dbc.Col([
            dbc.Card([
                dbc.CardHeader([
                    "卫星可见时段",
                    dbc.Button("导出 iCalendar", id="export-ical-btn", color="info", size="sm", className="float-right")
                ]),
                dbc.CardBody([
                    html.Div(id="visibility-table")
                ])
            ])
        ], md=12)
    ]),
    
    dcc.Download(id="download-ical")
], fluid=True)


@app.callback(
    Output("satellite-info", "children"),
    Output("ground-track-map", "figure"),
    Output("3d-orbit-view", "srcDoc"),
    Output("accuracy-info", "children"),
    Input("get-tle-btn", "n_clicks"),
    Input("tle-upload", "contents"),
    State("norad-input", "value"),
    State("tle-upload", "filename"),
    prevent_initial_call=True
)
def update_satellite_data(n_clicks, contents, norad_id, filename):
    global satellite_data, ground_track_data
    
    ctx = callback_context
    triggered_id = ctx.triggered[0]["prop_id"].split(".")[0]
    
    name = None
    line1 = None
    line2 = None
    
    if triggered_id == "get-tle-btn" and norad_id:
        name, line1, line2 = get_tle_from_norad(norad_id)
        if not name:
            return dbc.Alert("获取TLE失败，请检查NORAD ID", color="danger"), go.Figure(), "", ""
    
    elif triggered_id == "tle-upload" and contents:
        content_type, content_string = contents.split(',')
        decoded = base64.b64decode(content_string)
        sats = parse_tle_file(decoded.decode('utf-8'))
        if sats:
            name = sats[0]['name']
            line1 = sats[0]['line1']
            line2 = sats[0]['line2']
        else:
            return dbc.Alert("解析TLE文件失败", color="danger"), go.Figure(), "", ""
    
    if not line1 or not line2:
        return dbc.Alert("请输入有效数据", color="warning"), go.Figure(), "", ""
    
    sat = create_satellite(line1, line2)
    start_time = datetime.utcnow()
    ground_track_data = calculate_ground_track(sat, start_time)
    current_pos = get_current_position(sat)
    orbit_points = get_orbit_points(sat)
    
    accuracy_analysis = analyze_orbit_accuracy(sat, start_time)
    
    satellite_data = {
        'name': name,
        'sat': sat,
        'line1': line1,
        'line2': line2
    }
    
    info = dbc.Alert([
        html.Strong(f"卫星: {name}"),
        html.Br(),
        f"当前位置: 经度 {current_pos['lon']:.2f}°, 纬度 {current_pos['lat']:.2f}°, 高度 {current_pos['alt']:.1f} km"
    ], color="success")
    
    fig = go.Figure()
    
    fig.add_trace(go.Scattermapbox(
        lon=ground_track_data['lons'],
        lat=ground_track_data['lats'],
        mode='lines',
        line=dict(width=2, color='cyan'),
        name='地面轨迹'
    ))
    
    fig.add_trace(go.Scattermapbox(
        lon=[current_pos['lon']],
        lat=[current_pos['lat']],
        mode='markers',
        marker=dict(size=12, color='red'),
        name='当前位置'
    ))
    
    fig.update_layout(
        mapbox_style="carto-darkmatter",
        mapbox=dict(
            zoom=1,
            center=dict(lon=0, lat=0)
        ),
        margin={"r": 0, "t": 0, "l": 0, "b": 0},
        showlegend=True,
        legend=dict(orientation="h", yanchor="bottom", y=0.01, xanchor="right", x=0.99),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)'
    )
    
    html_3d = generate_3d_html(orbit_points, current_pos)
    
    accuracy_display = generate_accuracy_display(accuracy_analysis)
    
    return info, fig, html_3d, accuracy_display


@app.callback(
    Output("visibility-table", "children"),
    Input("calc-visibility-btn", "n_clicks"),
    State("lat-input", "value"),
    State("lon-input", "value"),
    State("min-el-input", "value"),
    prevent_initial_call=True
)
def update_visibility(n_clicks, lat, lon, min_el):
    global satellite_data, visibility_passes
    
    if not satellite_data:
        return dbc.Alert("请先加载卫星数据", color="warning")
    
    passes = calculate_visibility(
        satellite_data['sat'],
        lat, lon, 0,
        min_elevation=min_el
    )
    
    visibility_passes = passes
    
    if not passes:
        return dbc.Alert("未来7天内没有可见时段", color="info")
    
    table_header = [
        html.Thead(html.Tr([
            html.Th("序号"),
            html.Th("开始时间 (UTC)"),
            html.Th("结束时间 (UTC)"),
            html.Th("持续时间 (分钟)"),
            html.Th("最大仰角 (°)"),
            html.Th("最大仰角时间")
        ]))
    ]
    
    rows = []
    for i, p in enumerate(passes, 1):
        rows.append(html.Tr([
            html.Td(i),
            html.Td(p['start_time'].strftime("%Y-%m-%d %H:%M:%S")),
            html.Td(p['end_time'].strftime("%Y-%m-%d %H:%M:%S")),
            html.Td(f"{p['duration']:.1f}"),
            html.Td(f"{p['max_el']:.1f}"),
            html.Td(p['max_el_time'].strftime("%H:%M:%S"))
        ]))
    
    table_body = [html.Tbody(rows)]
    table = dbc.Table(table_header + table_body, striped=True, bordered=True, hover=True, dark=True)
    
    return table


@app.callback(
    Output("download-ical", "data"),
    Input("export-ical-btn", "n_clicks"),
    State("lat-input", "value"),
    State("lon-input", "value"),
    prevent_initial_call=True
)
def export_ical(n_clicks, lat, lon):
    global satellite_data, visibility_passes
    
    if not satellite_data or not visibility_passes:
        return None
    
    ical_data = generate_ical(
        visibility_passes,
        satellite_data['name'],
        lat, lon
    )
    
    return dict(content=ical_data.decode('utf-8'), filename=f"{satellite_data['name']}_passes.ics")


def generate_3d_html(orbit_points, current_pos):
    orbit_json = "[" + ",".join([f"[{p[0]},{p[1]},{p[2]}]" for p in orbit_points]) + "]"
    current_json = f"[{current_pos['position'][0]},{current_pos['position'][1]},{current_pos['position'][2]}]"
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ margin: 0; background: #111; }}
            #canvas-container {{ width: 100%; height: 600px; }}
        </style>
    </head>
    <body>
        <div id="canvas-container"></div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
        <script>
            const container = document.getElementById('canvas-container');
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(45, container.clientWidth / 600, 0.1, 100000);
            const renderer = new THREE.WebGLRenderer({{ antialias: true }});
            renderer.setSize(container.clientWidth, 600);
            container.appendChild(renderer.domElement);
            
            const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
            scene.add(ambientLight);
            const pointLight = new THREE.PointLight(0xffffff, 1, 100000);
            pointLight.position.set(50000, 50000, 50000);
            scene.add(pointLight);
            
            const earthGeometry = new THREE.SphereGeometry(6378, 64, 64);
            const earthMaterial = new THREE.MeshPhongMaterial({{
                color: 0x2233ff,
                emissive: 0x112244,
                shininess: 10
            }});
            const earth = new THREE.Mesh(earthGeometry, earthMaterial);
            scene.add(earth);
            
            const orbitPoints = {orbit_json};
            const scale = 1;
            const orbitGeometry = new THREE.BufferGeometry();
            const orbitVertices = [];
            for (let p of orbitPoints) {{
                orbitVertices.push(p[0] * scale, p[1] * scale, p[2] * scale);
            }}
            orbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(orbitVertices, 3));
            const orbitMaterial = new THREE.LineBasicMaterial({{ color: 0x00ffff }});
            const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
            scene.add(orbitLine);
            
            const satGeometry = new THREE.SphereGeometry(200, 16, 16);
            const satMaterial = new THREE.MeshBasicMaterial({{ color: 0xff0000 }});
            const sat = new THREE.Mesh(satGeometry, satMaterial);
            const currentPos = {current_json};
            sat.position.set(currentPos[0] * scale, currentPos[1] * scale, currentPos[2] * scale);
            scene.add(sat);
            
            camera.position.set(20000, 10000, 20000);
            camera.lookAt(0, 0, 0);
            
            let isDragging = false;
            let previousMousePosition = {{ x: 0, y: 0 }};
            
            container.addEventListener('mousedown', (e) => {{
                isDragging = true;
                previousMousePosition = {{ x: e.clientX, y: e.clientY }};
            }});
            
            container.addEventListener('mousemove', (e) => {{
                if (!isDragging) return;
                const deltaX = e.clientX - previousMousePosition.x;
                const deltaY = e.clientY - previousMousePosition.y;
                scene.rotation.y += deltaX * 0.005;
                scene.rotation.x += deltaY * 0.005;
                previousMousePosition = {{ x: e.clientX, y: e.clientY }};
            }});
            
            container.addEventListener('mouseup', () => {{ isDragging = false; }});
            container.addEventListener('mouseleave', () => {{ isDragging = false; }});
            
            container.addEventListener('wheel', (e) => {{
                e.preventDefault();
                camera.position.multiplyScalar(e.deltaY > 0 ? 1.1 : 0.9);
            }});
            
            function animate() {{
                requestAnimationFrame(animate);
                earth.rotation.y += 0.0005;
                renderer.render(scene, camera);
            }}
            animate();
        </script>
    </body>
    </html>
    """


def generate_accuracy_display(analysis):
    mean_alt = analysis['mean_altitude_km']
    requires_correction = analysis['requires_correction']
    correction_improves = analysis['correction_improves_accuracy']
    error_est = analysis['error_estimate']
    
    alert_color = "success"
    warning_icon = "✓"
    
    if mean_alt < 300:
        alert_color = "danger"
        warning_icon = "⚠️"
    elif mean_alt < 500:
        alert_color = "warning"
        warning_icon = "ℹ️"
    
    accuracy_content = [
        dbc.Row([
            dbc.Col([
                html.Div([
                    html.H4([warning_icon, " 轨道精度评估"], className="text-center mb-3"),
                    html.Hr(),
                    dbc.Row([
                        dbc.Col([
                            html.Strong("平均轨道高度:"),
                            html.Div(f"{mean_alt:.1f} km", className="display-6 text-center")
                        ], md=4),
                        dbc.Col([
                            html.Strong("估计日误差:"),
                            html.Div(f"{error_est['daily_error_km']:.1f} km", className="display-6 text-center")
                        ], md=4),
                        dbc.Col([
                            html.Strong("估计周误差:"),
                            html.Div(f"{error_est['weekly_error_km']:.1f} km", className="display-6 text-center")
                        ], md=4),
                    ], className="mb-4"),
                    html.Hr(),
                    dbc.Row([
                        dbc.Col([
                            html.Strong("大气阻力修正状态:"),
                            html.Br(),
                            html.Span(
                                "已启用 NRLMSISE-00 大气密度模型",
                                className="badge bg-success" if correction_improves else "badge bg-secondary"
                            ),
                            html.Br(),
                            html.Br(),
                            html.Strong("修正效果:"),
                            html.Br(),
                            f"7天内最大位置差异: {analysis['max_position_difference_km']:.2f} km",
                            html.Br(),
                            f"7天内平均位置差异: {analysis['mean_position_difference_km']:.2f} km"
                        ], md=6),
                        dbc.Col([
                            html.Strong("精度建议:"),
                            html.Br(),
                            html.Ul([
                                html.Li("NRLMSISE-00大气密度模型已集成"),
                                html.Li("大气阻力加速度实时计算"),
                                html.Li(f"当前高度: {'强烈建议' if mean_alt < 300 else '建议' if mean_alt < 500 else '可选'}使用修正"),
                            ])
                        ], md=6),
                    ]),
                ])
            ], md=12)
        ])
    ]
    
    return dbc.Alert(accuracy_content, color=alert_color)


if __name__ == "__main__":
    app.run_server(debug=True)
