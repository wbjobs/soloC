import rclpy
from rclpy.node import Node
from std_msgs.msg import String, Float32
from geometry_msgs.msg import Twist
from nav_msgs.msg import Odometry
import json
import time


class StatusPublisherNode(Node):
    def __init__(self):
        super().__init__('status_publisher_node')
        
        self.declare_parameter('publish_rate', 5.0)
        
        self.publish_rate = self.get_parameter('publish_rate').value
        
        self.robot_status_pub = self.create_publisher(String, '/web_robot_status', 10)
        
        self.cmd_vel_sub = self.create_subscription(
            Twist,
            '/cmd_vel',
            self.cmd_vel_callback,
            10
        )
        
        self.odom_sub = self.create_subscription(
            Odometry,
            '/odom',
            self.odom_callback,
            10
        )
        
        self.battery_sub = self.create_subscription(
            Float32,
            '/battery_level',
            self.battery_callback,
            10
        )
        
        self.create_timer(1.0 / self.publish_rate, self.publish_combined_status)
        
        self.current_cmd_vel = Twist()
        self.current_odom = None
        self.battery_level = 100.0
        self.start_time = time.time()
        
        self.get_logger().info('Status publisher node started')

    def cmd_vel_callback(self, msg):
        self.current_cmd_vel = msg

    def odom_callback(self, msg):
        self.current_odom = msg

    def battery_callback(self, msg):
        self.battery_level = msg.data

    def publish_combined_status(self):
        status = {
            'node_id': 'status_publisher',
            'timestamp': time.time(),
            'uptime': time.time() - self.start_time,
            'cmd_vel': {
                'linear_x': self.current_cmd_vel.linear.x,
                'linear_y': self.current_cmd_vel.linear.y,
                'linear_z': self.current_cmd_vel.linear.z,
                'angular_x': self.current_cmd_vel.angular.x,
                'angular_y': self.current_cmd_vel.angular.y,
                'angular_z': self.current_cmd_vel.angular.z
            },
            'battery': {
                'level': self.battery_level,
                'charging': False
            },
            'odometry': None
        }
        
        if self.current_odom:
            status['odometry'] = {
                'position': {
                    'x': self.current_odom.pose.pose.position.x,
                    'y': self.current_odom.pose.pose.position.y,
                    'z': self.current_odom.pose.pose.position.z
                },
                'orientation': {
                    'x': self.current_odom.pose.pose.orientation.x,
                    'y': self.current_odom.pose.pose.orientation.y,
                    'z': self.current_odom.pose.pose.orientation.z,
                    'w': self.current_odom.pose.pose.orientation.w
                },
                'linear_velocity': {
                    'x': self.current_odom.twist.twist.linear.x,
                    'y': self.current_odom.twist.twist.linear.y,
                    'z': self.current_odom.twist.twist.linear.z
                },
                'angular_velocity': {
                    'x': self.current_odom.twist.twist.angular.x,
                    'y': self.current_odom.twist.twist.angular.y,
                    'z': self.current_odom.twist.twist.angular.z
                }
            }
        
        msg = String()
        msg.data = json.dumps(status)
        self.robot_status_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = StatusPublisherNode()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
