export interface Vector3 {
  x: number
  y: number
  z: number
}

export interface Quaternion {
  x: number
  y: number
  z: number
  w: number
}

export interface Odometry {
  position: Vector3
  orientation: Quaternion
  linear_velocity: Vector3
  angular_velocity: Vector3
}

export interface CmdVel {
  linear_x: number
  linear_y: number
  linear_z: number
  angular_x: number
  angular_y: number
  angular_z: number
}

export interface Battery {
  level: number
  charging: boolean
}

export interface RobotStatus {
  node_id: string
  timestamp: number
  uptime: number
  cmd_vel: CmdVel
  battery: Battery
  odometry: Odometry | null
}

export interface LaserData {
  node_id: string
  header: {
    stamp_sec: number
    stamp_nanosec: number
    frame_id: string
  }
  angle_min: number
  angle_max: number
  angle_increment: number
  time_increment: number
  scan_time: number
  range_min: number
  range_max: number
  ranges: number[]
  angles: number[]
}

export interface JoystickData {
  x: number
  y: number
}

export interface Waypoint {
  x: number
  y: number
}

export interface PathPlan {
  waypoints: Waypoint[]
}

export type PathStatusType = 'idle' | 'ready' | 'executing' | 'paused' | 'completed' | 'stopped' | 'error'

export interface PathStatus {
  node_id: string
  status: PathStatusType
  data: {
    waypoints?: Waypoint[]
    current_index?: number
    total?: number
  }
  current_pose: {
    x: number
    y: number
    theta: number
  }
}

export interface ScriptFrame {
  timestamp: number
  joystick: JoystickData
}

export interface Script {
  id: string
  name: string
  createdAt: number
  frames: ScriptFrame[]
  duration: number
}

export type WebSocketMessageType = 
  | 'laser' 
  | 'status' 
  | 'battery' 
  | 'heartbeat' 
  | 'joystick' 
  | 'ping' 
  | 'pong'
  | 'path_plan'
  | 'path_control'
  | 'path_status'

export interface WebSocketMessage {
  type: WebSocketMessageType
  data?: LaserData | RobotStatus | Battery | JoystickData | PathStatus
  timestamp?: number
  x?: number
  y?: number
  waypoints?: Waypoint[]
  action?: string
}

export interface ConnectionState {
  connected: boolean
  lastHeartbeat: number | null
  reconnectAttempts: number
}

export type ScriptPlayerState = 'idle' | 'playing' | 'paused'
export type ScriptRecorderState = 'idle' | 'recording'
