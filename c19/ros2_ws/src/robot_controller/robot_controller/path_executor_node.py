import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist, Point
from nav_msgs.msg import Odometry
from std_msgs.msg import String, Float32, Bool
import json
import math
import time


class PathExecutorNode(Node):
    def __init__(self):
        super().__init__('path_executor_node')
        
        self.declare_parameter('max_linear_speed', 0.5)
        self.declare_parameter('max_angular_speed', 0.8)
        self.declare_parameter('position_tolerance', 0.1)
        self.declare_parameter('angle_tolerance', 0.05)
        
        self.max_linear_speed = self.get_parameter('max_linear_speed').value
        self.max_angular_speed = self.get_parameter('max_angular_speed').value
        self.position_tolerance = self.get_parameter('position_tolerance').value
        self.angle_tolerance = self.get_parameter('angle_tolerance').value
        
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)
        self.path_status_pub = self.create_publisher(String, '/web_path_status', 10)
        
        self.path_sub = self.create_subscription(
            String,
            '/web_path_plan',
            self.path_plan_callback,
            10
        )
        
        self.path_control_sub = self.create_subscription(
            String,
            '/web_path_control',
            self.path_control_callback,
            10
        )
        
        self.odom_sub = self.create_subscription(
            Odometry,
            '/odom',
            self.odom_callback,
            10
        )
        
        self.create_timer(0.1, self.control_loop)
        
        self.current_pose = {'x': 0.0, 'y': 0.0, 'theta': 0.0}
        self.path_waypoints = []
        self.current_waypoint_index = 0
        self.is_executing = False
        self.is_paused = False
        
        self.last_status_time = 0
        
        self.get_logger().info('Path executor node started')

    def odom_callback(self, msg):
        position = msg.pose.pose.position
        orientation = msg.pose.pose.orientation
        
        x = orientation.x
        y = orientation.y
        z = orientation.z
        w = orientation.w
        theta = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
        
        self.current_pose = {
            'x': position.x,
            'y': position.y,
            'theta': theta
        }

    def path_plan_callback(self, msg):
        try:
            data = json.loads(msg.data)
            waypoints = data.get('waypoints', [])
            
            if len(waypoints) < 2:
                self.get_logger().warning('Path needs at least 2 waypoints')
                self.publish_status('error', 'Path needs at least 2 waypoints')
                return
            
            self.path_waypoints = waypoints
            self.current_waypoint_index = 0
            self.is_executing = False
            self.is_paused = False
            
            self.get_logger().info(f'Received path with {len(waypoints)} waypoints')
            self.publish_status('ready', {
                'waypoints': waypoints,
                'current_index': 0
            })
            
        except json.JSONDecodeError as e:
            self.get_logger().error(f'Invalid path data: {e}')

    def path_control_callback(self, msg):
        try:
            data = json.loads(msg.data)
            action = data.get('action', '')
            
            if action == 'start':
                if len(self.path_waypoints) < 2:
                    self.publish_status('error', 'No path loaded')
                    return
                self.current_waypoint_index = 0
                self.is_executing = True
                self.is_paused = False
                self.get_logger().info('Path execution started')
                self.publish_status('executing', {
                    'current_index': self.current_waypoint_index,
                    'total': len(self.path_waypoints)
                })
                
            elif action == 'pause':
                self.is_paused = True
                self.stop_robot()
                self.get_logger().info('Path execution paused')
                self.publish_status('paused', {
                    'current_index': self.current_waypoint_index
                })
                
            elif action == 'resume':
                self.is_paused = False
                self.get_logger().info('Path execution resumed')
                self.publish_status('executing', {
                    'current_index': self.current_waypoint_index
                })
                
            elif action == 'stop':
                self.is_executing = False
                self.is_paused = False
                self.stop_robot()
                self.get_logger().info('Path execution stopped')
                self.publish_status('stopped', {})
                
            elif action == 'clear':
                self.is_executing = False
                self.is_paused = False
                self.path_waypoints = []
                self.current_waypoint_index = 0
                self.stop_robot()
                self.get_logger().info('Path cleared')
                self.publish_status('idle', {})
                
        except json.JSONDecodeError as e:
            self.get_logger().error(f'Invalid control command: {e}')

    def control_loop(self):
        if not self.is_executing or self.is_paused:
            return
        
        if self.current_waypoint_index >= len(self.path_waypoints):
            self.is_executing = False
            self.stop_robot()
            self.get_logger().info('Path execution completed')
            self.publish_status('completed', {})
            return
        
        target = self.path_waypoints[self.current_waypoint_index]
        dx = target['x'] - self.current_pose['x']
        dy = target['y'] - self.current_pose['y']
        distance = math.sqrt(dx * dx + dy * dy)
        
        if distance < self.position_tolerance:
            self.current_waypoint_index += 1
            self.get_logger().info(
                f'Reached waypoint {self.current_waypoint_index}/{len(self.path_waypoints)}'
            )
            self.publish_status('executing', {
                'current_index': self.current_waypoint_index,
                'total': len(self.path_waypoints)
            })
            return
        
        target_angle = math.atan2(dy, dx)
        angle_diff = target_angle - self.current_pose['theta']
        
        while angle_diff > math.pi:
            angle_diff -= 2 * math.pi
        while angle_diff < -math.pi:
            angle_diff += 2 * math.pi
        
        twist = Twist()
        
        if abs(angle_diff) > self.angle_tolerance:
            angular_speed = angle_diff * 2.0
            angular_speed = max(-self.max_angular_speed, min(self.max_angular_speed, angular_speed))
            twist.angular.z = angular_speed
            twist.linear.x = 0.0
        else:
            linear_speed = distance * 1.0
            linear_speed = max(-self.max_linear_speed, min(self.max_linear_speed, linear_speed))
            twist.linear.x = linear_speed
            twist.angular.z = 0.0
        
        self.cmd_vel_pub.publish(twist)

    def stop_robot(self):
        twist = Twist()
        twist.linear.x = 0.0
        twist.angular.z = 0.0
        self.cmd_vel_pub.publish(twist)

    def publish_status(self, status, data):
        now = time.time()
        if now - self.last_status_time < 0.1:
            return
        self.last_status_time = now
        
        message = {
            'node_id': 'path_executor',
            'status': status,
            'data': data,
            'current_pose': self.current_pose
        }
        
        msg = String()
        msg.data = json.dumps(message)
        self.path_status_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = PathExecutorNode()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        node.stop_robot()
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
