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
from constellation import ConstellationAnalyzer, create_sample_constellation

app = dash.Dash(__name__, external_stylesheets=[dbc.themes.DARKLY])
server = app.server

constellation = ConstellationAnalyzer(max_satellites=10)
visibility_passes = None

app.layout = dbc.Container([
    html.H1("卫星星座分析与可视化", className="text-center my-4"),
    
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
                    dbc.Row([
                        dbc.Col([
                            dbc.Button("加载示例星座", id="load-sample-btn", color="secondary", className="w-100 mt-2")
                        ]),
                        dbc.Col([
                            dbc.Button("清空星座", id="clear-constellation-btn", color="danger", className="w-100 mt-2")
                        ])
                    ]),
                    html.Div(id="constellation-info", className="mt-3")
                ])
            ])
        ], md=4),
        
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("星座管理"),
                dbc.CardBody([
                    html.Div(id="satellite-list"),
                    html.Hr(),
                    dbc.Row([
                        dbc.Col([
                            dbc.Label("传播时长 (小时)"),
                            dbc.Input(id="prop-hours", type="number", value=24, min=1, max=168)
                        ]),
                        dbc.Col([
                            dbc.Label("时间步长 (分钟)"),
                            dbc.Input(id="prop-step", type="number", value=5, min=1, max=60)
                        ]),
                        dbc.Col([
                            dbc.Button("传播星座", id="propagate-btn", color="success", className="w-100 mt-4")
                        ])
                    ])
                ])
            ])
        ], md=8)
    ], className="mb-4"),
    
    dbc.Row([
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("星座地面轨迹与星间链路"),
                dbc.CardBody([
                    dcc.Graph(id="constellation-map", style={"height": "600px"})
                ])
            ])
        ], md=12)
    ], className="mb-4"),
    
    dbc.Row([
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("3D 星座可视化"),
                dbc.CardBody([
                    html.Iframe(
                        id="3d-constellation-view",
                        srcDoc="",
                        style={"width": "100%", "height": "700px", "border": "none"}
                    )
                ])
            ])
        ], md=12)
    ], className="mb-4"),
    
    dbc.Row([
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("星间链路统计"),
                dbc.CardBody([
                    html.Div(id="link-stats")
                ])
            ])
        ], md=6),
        
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("重访时间分析设置"),
                dbc.CardBody([
                    dbc.Row([
                        dbc.Col([
                            dbc.Label("目标纬度 (°)"),
                            dbc.Input(id="revisit-lat", type="number", value=39.9042)
                        ]),
                        dbc.Col([
                            dbc.Label("目标经度 (°)"),
                            dbc.Input(id="revisit-lon", type="number", value=116.4074)
                        ]),
                        dbc.Col([
                            dbc.Label("仰角阈值 (°)"),
                            dbc.Input(id="revisit-el", type="number", value=10, min=0, max=90)
                        ]),
                        dbc.Col([
                            dbc.Button("计算重访时间", id="calc-revisit-btn", color="warning", className="w-100 mt-4")
                        ])
                    ])
                ])
            ])
        ], md=6)
    ], className="mb-4"),
    
    dbc.Row([
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("重访时间分布直方图"),
                dbc.CardBody([
                    dcc.Graph(id="revisit-histogram", style={"height": "500px"})
                ])
            ])
        ], md=12)
    ], className="mb-4"),
    
    dbc.Row([
        dbc.Col([
            dbc.Card([
                dbc.CardHeader("重访时间统计"),
                dbc.CardBody([
                    html.Div(id="revisit-stats")
                ])
            ])
        ], md=12)
    ]),
    
    dcc.Store(id="constellation-data")
], fluid=True)


@app.callback(
    Output("constellation-info", "children"),
    Output("satellite-list", "children"),
    Input("get-tle-btn", "n_clicks"),
    Input("tle-upload", "contents"),
    Input("load-sample-btn", "n_clicks"),
    Input("clear-constellation-btn", "n_clicks"),
    State("norad-input", "value"),
    State("tle-upload", "filename"),
    prevent_initial_call=True
)
def update_constellation(n_clicks_tle, contents, n_clicks_sample, n_clicks_clear, norad_id, filename):
    global constellation
    
    ctx = callback_context
    triggered_id = ctx.triggered[0]["prop_id"].split(".")[0]
    
    if triggered_id == "clear-constellation-btn":
        constellation.clear_satellites()
        info = dbc.Alert("星座已清空", color="info")
        return info, generate_satellite_list()
    
    if triggered_id == "load-sample-btn":
        constellation = create_sample_constellation()
        info = dbc.Alert(f"已加载示例星座 ({len(constellation.satellites)}颗卫星)", color="success")
        return info, generate_satellite_list()
    
    if triggered_id == "get-tle-btn" and norad_id:
        name, line1, line2 = get_tle_from_norad(norad_id)
        if name:
            success, msg = constellation.add_satellite(name, line1, line2)
            color = "success" if success else "danger"
            info = dbc.Alert(msg, color=color)
            return info, generate_satellite_list()
        else:
            info = dbc.Alert("获取TLE失败，请检查NORAD ID", color="danger")
            return info, generate_satellite_list()
    
    if triggered_id == "tle-upload" and contents:
        content_type, content_string = contents.split(',')
        decoded = base64.b64decode(content_string)
        sats = parse_tle_file(decoded.decode('utf-8'))
        if sats:
            msgs = []
            for sat in sats:
                success, msg = constellation.add_satellite(sat['name'], sat['line1'], sat['line2'])
                msgs.append(msg)
            info = dbc.Alert(html.Br().join(msgs), color="success" if len(constellation.satellites) > 0 else "danger")
            return info, generate_satellite_list()
        else:
            info = dbc.Alert("解析TLE文件失败", color="danger")
            return info, generate_satellite_list()
    
    return "", generate_satellite_list()


def generate_satellite_list():
    global constellation
    
    if not constellation.satellites:
        return dbc.Alert("暂无卫星，请添加卫星数据", color="info")
    
    list_items = []
    for i, sat_data in enumerate(constellation.satellite_data):
        list_items.append(
            dbc.ListGroupItem([
                html.Strong(f"{i+1}. {sat_data['name']}"),
                html.Br(),
                html.Small(f"NORAD ID: {sat_data['line1'][2:7]}")
            ])
        )
    
    return html.Div([
        html.H6(f"卫星列表 ({len(constellation.satellites)}/{constellation.max_satellites})"),
        dbc.ListGroup(list_items)
    ])


@app.callback(
    Output("constellation-map", "figure"),
    Output("3d-constellation-view", "srcDoc"),
    Output("link-stats", "children"),
    Input("propagate-btn", "n_clicks"),
    State("prop-hours", "value"),
    State("prop-step", "value"),
    prevent_initial_call=True
)
def propagate_and_visualize(n_clicks, hours, step):
    global constellation
    
    if not constellation.satellites:
        return go.Figure(), "", dbc.Alert("请先添加卫星", color="warning")
    
    constellation.propagate_constellation(hours=hours, step_minutes=step)
    
    links = constellation.calculate_inter_satellite_links(time_index=0)
    all_links = constellation.get_all_links_over_time(step_interval=10)
    
    fig = go.Figure()
    
    colors = ['cyan', 'magenta', 'yellow', 'lime', 'orange', 'pink', 'green', 'blue', 'red', 'purple']
    
    for i, result in enumerate(constellation.propagation_results):
        color = colors[i % len(colors)]
        fig.add_trace(go.Scattermapbox(
            lon=result['lons'],
            lat=result['lats'],
            mode='lines',
            line=dict(width=2, color=color),
            name=f"{result['sat_name']} 轨迹",
            hoverinfo='name'
        ))
        
        current_idx = min(0, len(result['lons']) - 1)
        fig.add_trace(go.Scattermapbox(
            lon=[result['lons'][current_idx]],
            lat=[result['lats'][current_idx]],
            mode='markers',
            marker=dict(size=12, color=color, symbol='circle'),
            name=result['sat_name'],
            hoverinfo='name'
        ))
    
    for link in links:
        idx1 = link['sat1']
        idx2 = link['sat2']
        result1 = constellation.propagation_results[idx1]
        result2 = constellation.propagation_results[idx2]
        
        mid_lon = (result1['lons'][0] + result2['lons'][0]) / 2
        mid_lat = (result1['lats'][0] + result2['lats'][0]) / 2
        
        fig.add_trace(go.Scattermapbox(
            lon=[result1['lons'][0], result2['lons'][0]],
            lat=[result1['lats'][0], result2['lats'][0]],
            mode='lines',
            line=dict(width=3, color='white', dash='dash'),
            name=f"链路 {link['sat1_name']} ↔ {link['sat2_name']}<br>距离: {link['distance']:.1f}km",
            hoverinfo='name'
        ))
    
    fig.update_layout(
        mapbox_style="carto-darkmatter",
        mapbox=dict(
            zoom=0,
            center=dict(lon=0, lat=0)
        ),
        margin={"r": 0, "t": 0, "l": 0, "b": 0},
        showlegend=True,
        legend=dict(orientation="v", yanchor="top", y=1.0, xanchor="left", x=0.01, bgcolor="rgba(0,0,0,0.5)"),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)'
    )
    
    html_3d = generate_3d_constellation_html(links)
    
    link_counts = [item['link_count'] for item in all_links]
    avg_links = np.mean(link_counts) if link_counts else 0
    max_links = np.max(link_counts) if link_counts else 0
    min_links = np.min(link_counts) if link_counts else 0
    
    stats_content = dbc.Row([
        dbc.Col([
            html.H4(f"{len(links)}", className="text-center text-primary"),
            html.P("当前链路数", className="text-center text-muted")
        ]),
        dbc.Col([
            html.H4(f"{avg_links:.1f}", className="text-center text-success"),
            html.P("平均链路数", className="text-center text-muted")
        ]),
        dbc.Col([
            html.H4(f"{max_links}", className="text-center text-warning"),
            html.P("最大链路数", className="text-center text-muted")
        ]),
        dbc.Col([
            html.H4(f"{min_links}", className="text-center text-info"),
            html.P("最小链路数", className="text-center text-muted")
        ])
    ])
    
    return fig, html_3d, stats_content


def generate_3d_constellation_html(links):
    global constellation
    
    orbit_points_list = []
    for sat in constellation.satellites:
        points = get_orbit_points(sat, num_points=100)
        orbit_points_list.append(points)
    
    colors = ['00ffff', 'ff00ff', 'ffff00', '00ff00', 'ffa500', 'ff69b4', '008000', '0000ff', 'ff0000', '800080']
    
    orbit_js = ""
    for i, points in enumerate(orbit_points_list):
        points_js = ",".join([f"[{p[0]},{p[1]},{p[2]}]" for p in points])
        color = colors[i % len(colors)]
        orbit_js += f"const orbit{i} = [{points_js}];\n"
        orbit_js += f"const color{i} = 0x{color};\n"
    
    link_js = ""
    for i, link in enumerate(links):
        link_js += f"const link{i}Start = [{link['pos1'][0]},{link['pos1'][1]},{link['pos1'][2]}];\n"
        link_js += f"const link{i}End = [{link['pos2'][0]},{link['pos2'][1]},{link['pos2'][2]}];\n"
    
    num_orbits = len(orbit_points_list)
    num_links = len(links)
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ margin: 0; background: #111; }}
            #canvas-container {{ width: 100%; height: 700px; }}
        </style>
    </head>
    <body>
        <div id="canvas-container"></div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
        <script>
            const container = document.getElementById('canvas-container');
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(45, container.clientWidth / 700, 0.1, 100000);
            const renderer = new THREE.WebGLRenderer({{ antialias: true }});
            renderer.setSize(container.clientWidth, 700);
            container.appendChild(renderer.domElement);
            
            const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
            scene.add(ambientLight);
            const pointLight = new THREE.PointLight(0xffffff, 1, 100000);
            pointLight.position.set(50000, 50000, 50000);
            scene.add(pointLight);
            
            const earthGeometry = new THREE.SphereGeometry(6378, 32, 32);
            const earthMaterial = new THREE.MeshPhongMaterial({{
                color: 0x2233ff,
                emissive: 0x112244,
                shininess: 10,
                transparent: true,
                opacity: 0.8
            }});
            const earth = new THREE.Mesh(earthGeometry, earthMaterial);
            scene.add(earth);
            
            {orbit_js}
            const numOrbits = {num_orbits};
            
            for (let i = 0; i < numOrbits; i++) {{
                const points = window['orbit' + i];
                const color = window['color' + i];
                const geometry = new THREE.BufferGeometry();
                const vertices = [];
                for (let p of points) {{
                    vertices.push(p[0], p[1], p[2]);
                }}
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                const material = new THREE.LineBasicMaterial({{ color: color, linewidth: 2 }});
                const line = new THREE.Line(geometry, material);
                scene.add(line);
                
                const satGeometry = new THREE.SphereGeometry(200, 16, 16);
                const satMaterial = new THREE.MeshBasicMaterial({{ color: color }});
                const sat = new THREE.Mesh(satGeometry, satMaterial);
                sat.position.set(points[0][0], points[0][1], points[0][2]);
                scene.add(sat);
            }}
            
            {link_js}
            const numLinks = {num_links};
            
            for (let i = 0; i < numLinks; i++) {{
                const start = window['link' + i + 'Start'];
                const end = window['link' + i + 'End'];
                const geometry = new THREE.BufferGeometry();
                const vertices = new Float32Array([
                    start[0], start[1], start[2],
                    end[0], end[1], end[2]
                ]);
                geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                const material = new THREE.LineBasicMaterial({{ color: 0xffffff, linewidth: 3 }});
                const line = new THREE.Line(geometry, material);
                scene.add(line);
            }}
            
            camera.position.set(25000, 15000, 25000);
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
                earth.rotation.y += 0.001;
                renderer.render(scene, camera);
            }}
            animate();
        </script>
    </body>
    </html>
    """


@app.callback(
    Output("revisit-histogram", "figure"),
    Output("revisit-stats", "children"),
    Input("calc-revisit-btn", "n_clicks"),
    State("revisit-lat", "value"),
    State("revisit-lon", "value"),
    State("revisit-el", "value"),
    prevent_initial_call=True
)
def calculate_revisit_time(n_clicks, target_lat, target_lon, min_elevation):
    global constellation
    
    if not constellation.propagation_results:
        return go.Figure(), dbc.Alert("请先传播星座", color="warning")
    
    result = constellation.calculate_revisit_time(
        target_lat, target_lon, min_elevation
    )
    
    if not result['revisit_times']:
        fig = go.Figure()
        fig.add_annotation(text="无可见事件", xref="paper", yref="paper", x=0.5, y=0.5, showarrow=False, font=dict(size=20))
        fig.update_layout(title=f"重访时间分布 - 目标点: ({target_lat:.2f}°, {target_lon:.2f}°)")
        return fig, dbc.Alert("在传播时段内无可见事件", color="info")
    
    fig = go.Figure()
    fig.add_trace(go.Histogram(
        x=result['revisit_times'],
        nbinsx=30,
        name='重访时间',
        marker_color='cyan',
        opacity=0.7
    ))
    
    fig.update_layout(
        title=f"重访时间分布 - 目标点: ({target_lat:.2f}°, {target_lon:.2f}°)",
        xaxis_title="重访时间 (分钟)",
        yaxis_title="频数",
        bargap=0.2,
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0.2)',
        font=dict(color='white')
    )
    
    stats_content = dbc.Row([
        dbc.Col([
            html.H4(f"{result['mean_revisit']:.1f}", className="text-center text-primary"),
            html.P("平均重访时间 (分钟)", className="text-center text-muted")
        ]),
        dbc.Col([
            html.H4(f"{result['median_revisit']:.1f}", className="text-center text-success"),
            html.P("中位数重访时间 (分钟)", className="text-center text-muted")
        ]),
        dbc.Col([
            html.H4(f"{result['min_revisit']:.1f}", className="text-center text-warning"),
            html.P("最小重访时间 (分钟)", className="text-center text-muted")
        ]),
        dbc.Col([
            html.H4(f"{result['max_revisit']:.1f}", className="text-center text-danger"),
            html.P("最大重访时间 (分钟)", className="text-center text-muted")
        ]),
        dbc.Col([
            html.H4(f"{result['total_visibility_count']}", className="text-center text-info"),
            html.P("总可见事件数", className="text-center text-muted")
        ])
    ])
    
    return fig, stats_content


if __name__ == "__main__":
    app.run_server(debug=True, port=8051)
