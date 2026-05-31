import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan
from nav_msgs.msg import Odometry
from geometry_msgs.msg import Twist
from std_msgs.msg import Float32
import math
import time
import random


class SimulationNode(Node):
    def __init__(self):
        super().__init__('simulation_node')
        
        self.declare_parameter('laser_ranges', 360)
        self.declare_parameter('laser_rate', 10.0)
        self.declare_parameter('odom_rate', 20.0)
        
        self.laser_ranges = self.get_parameter('laser_ranges').value
        self.laser_rate = self.get_parameter('laser_rate').value
        self.odom_rate = self.get_parameter('odom_rate').value
        
        self.scan_pub = self.create_publisher(LaserScan, '/scan', 10)
        self.odom_pub = self.create_publisher(Odometry, '/odom', 10)
        
        self.cmd_vel_sub = self.create_subscription(
            Twist,
            '/cmd_vel',
            self.cmd_vel_callback,
            10
        )
        
        self.create_timer(1.0 / self.laser_rate, self.publish_laser_scan)
        self.create_timer(1.0 / self.odom_rate, self.publish_odometry)
        
        self.current_cmd_vel = Twist()
        self.pose_x = 0.0
        self.pose_y = 0.0
        self.pose_theta = 0.0
        self.last_time = time.time()
        
        self.obstacles = [
            (3.0, 0.0, 0.5),
            (-2.0, 2.0, 0.8),
            (0.0, -4.0, 1.0),
            (5.0, 3.0, 0.6),
            (-4.0, -2.0, 0.7)
        ]
        
        self.get_logger().info('Simulation node started')

    def cmd_vel_callback(self, msg):
        self.current_cmd_vel = msg

    def update_pose(self):
        current_time = time.time()
        dt = current_time - self.last_time
        self.last_time = current_time
        
        v = self.current_cmd_vel.linear.x
        w = self.current_cmd_vel.angular.z
        
        if abs(w) > 0.001:
            self.pose_theta += w * dt
            self.pose_x += (v / w) * (math.sin(self.pose_theta) - math.sin(self.pose_theta - w * dt))
            self.pose_y += (v / w) * (-math.cos(self.pose_theta) + math.cos(self.pose_theta - w * dt))
        else:
            self.pose_x += v * math.cos(self.pose_theta) * dt
            self.pose_y += v * math.sin(self.pose_theta) * dt
        
        self.pose_theta = math.atan2(math.sin(self.pose_theta), math.cos(self.pose_theta))

    def publish_laser_scan(self):
        scan = LaserScan()
        scan.header.stamp = self.get_clock().now().to_msg()
        scan.header.frame_id = 'laser'
        
        scan.angle_min = -math.pi
        scan.angle_max = math.pi
        scan.angle_increment = 2 * math.pi / self.laser_ranges
        scan.time_increment = 0.0
        scan.scan_time = 1.0 / self.laser_rate
        scan.range_min = 0.1
        scan.range_max = 30.0
        
        ranges = []
        for i in range(self.laser_ranges):
            angle = scan.angle_min + i * scan.angle_increment
            range_val = scan.range_max
            
            for (ox, oy, radius) in self.obstacles:
                dx = ox - self.pose_x
                dy = oy - self.pose_y
                
                robot_angle = math.atan2(dy, dx) - self.pose_theta
                robot_angle = math.atan2(math.sin(robot_angle), math.cos(robot_angle))
                
                angle_diff = abs(angle - robot_angle)
                if angle_diff < math.pi / 6:
                    dist = math.sqrt(dx * dx + dy * dy) - radius
                    if dist < range_val and dist > scan.range_min:
                        range_val = dist
            
            range_val += random.uniform(-0.02, 0.02)
            ranges.append(max(scan.range_min, min(scan.range_max, range_val)))
        
        scan.ranges = ranges
        scan.intensities = []
        
        self.scan_pub.publish(scan)

    def publish_odometry(self):
        self.update_pose()
        
        odom = Odometry()
        odom.header.stamp = self.get_clock().now().to_msg()
        odom.header.frame_id = 'odom'
        odom.child_frame_id = 'base_link'
        
        odom.pose.pose.position.x = self.pose_x
        odom.pose.pose.position.y = self.pose_y
        odom.pose.pose.position.z = 0.0
        
        odom.pose.pose.orientation.x = 0.0
        odom.pose.pose.orientation.y = 0.0
        odom.pose.pose.orientation.z = math.sin(self.pose_theta / 2)
        odom.pose.pose.orientation.w = math.cos(self.pose_theta / 2)
        
        odom.twist.twist.linear.x = self.current_cmd_vel.linear.x
        odom.twist.twist.linear.y = 0.0
        odom.twist.twist.linear.z = 0.0
        odom.twist.twist.angular.x = 0.0
        odom.twist.twist.angular.y = 0.0
        odom.twist.twist.angular.z = self.current_cmd_vel.angular.z
        
        self.odom_pub.publish(odom)


def main(args=None):
    rclpy.init(args=args)
    node = SimulationNode()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
