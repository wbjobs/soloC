import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from std_msgs.msg import String, Float32
import json


class RobotControllerNode(Node):
    def __init__(self):
        super().__init__('robot_controller_node')
        
        self.declare_parameter('max_linear_speed', 1.0)
        self.declare_parameter('max_angular_speed', 1.5)
        
        self.max_linear_speed = self.get_parameter('max_linear_speed').value
        self.max_angular_speed = self.get_parameter('max_angular_speed').value
        
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)
        self.status_pub = self.create_publisher(String, '/robot_status', 10)
        self.battery_pub = self.create_publisher(Float32, '/battery_level', 10)
        
        self.joystick_sub = self.create_subscription(
            String,
            '/web_joystick',
            self.joystick_callback,
            10
        )
        
        self.create_timer(0.1, self.publish_status)
        self.create_timer(5.0, self.publish_battery)
        
        self.current_linear_x = 0.0
        self.current_angular_z = 0.0
        self.battery_level = 100.0
        
        self.get_logger().info('Robot controller node started')

    def joystick_callback(self, msg):
        try:
            data = json.loads(msg.data)
            x = data.get('x', 0.0)
            y = data.get('y', 0.0)
            
            self.current_linear_x = y * self.max_linear_speed
            self.current_angular_z = -x * self.max_angular_speed
            
            self.publish_cmd_vel()
            
            self.get_logger().debug(
                f'Joystick: x={x:.2f}, y={y:.2f} -> linear={self.current_linear_x:.2f}, angular={self.current_angular_z:.2f}'
            )
        except json.JSONDecodeError as e:
            self.get_logger().error(f'Invalid joystick data: {e}')

    def publish_cmd_vel(self):
        twist = Twist()
        twist.linear.x = self.current_linear_x
        twist.linear.y = 0.0
        twist.linear.z = 0.0
        twist.angular.x = 0.0
        twist.angular.y = 0.0
        twist.angular.z = self.current_angular_z
        
        self.cmd_vel_pub.publish(twist)

    def publish_status(self):
        status = {
            'node_id': 'robot_controller',
            'linear_speed': self.current_linear_x,
            'angular_speed': self.current_angular_z,
            'max_linear_speed': self.max_linear_speed,
            'max_angular_speed': self.max_angular_speed,
            'connected': True
        }
        
        msg = String()
        msg.data = json.dumps(status)
        self.status_pub.publish(msg)

    def publish_battery(self):
        self.battery_level = max(0.0, self.battery_level - 0.1)
        if self.battery_level < 20.0:
            self.get_logger().warning(f'Battery level low: {self.battery_level:.1f}%')
        
        msg = Float32()
        msg.data = self.battery_level
        self.battery_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = RobotControllerNode()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
