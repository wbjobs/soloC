import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan
from std_msgs.msg import String
import json
import math


class LaserRelayNode(Node):
    def __init__(self):
        super().__init__('laser_relay_node')
        
        self.declare_parameter('scan_topic', '/scan')
        self.declare_parameter('publish_rate', 10.0)
        self.declare_parameter('max_range', 30.0)
        
        self.scan_topic = self.get_parameter('scan_topic').value
        self.publish_rate = self.get_parameter('publish_rate').value
        self.max_range = self.get_parameter('max_range').value
        
        self.laser_data_pub = self.create_publisher(String, '/web_laser_data', 10)
        
        self.scan_sub = self.create_subscription(
            LaserScan,
            self.scan_topic,
            self.scan_callback,
            10
        )
        
        self.last_scan = None
        self.create_timer(1.0 / self.publish_rate, self.publish_laser_data)
        
        self.get_logger().info(f'Laser relay node started, listening to {self.scan_topic}')

    def scan_callback(self, msg):
        self.last_scan = msg

    def publish_laser_data(self):
        if self.last_scan is None:
            return
        
        scan = self.last_scan
        ranges = []
        angles = []
        
        for i, r in enumerate(scan.ranges):
            if math.isinf(r) or math.isnan(r):
                continue
            if r < scan.range_min:
                r = scan.range_min
            if r > self.max_range:
                r = self.max_range
            
            angle = scan.angle_min + i * scan.angle_increment
            ranges.append(r)
            angles.append(angle)
        
        laser_data = {
            'node_id': 'laser_relay',
            'header': {
                'stamp_sec': scan.header.stamp.sec,
                'stamp_nanosec': scan.header.stamp.nanosec,
                'frame_id': scan.header.frame_id
            },
            'angle_min': scan.angle_min,
            'angle_max': scan.angle_max,
            'angle_increment': scan.angle_increment,
            'time_increment': scan.time_increment,
            'scan_time': scan.scan_time,
            'range_min': scan.range_min,
            'range_max': min(scan.range_max, self.max_range),
            'ranges': ranges,
            'angles': angles
        }
        
        msg = String()
        msg.data = json.dumps(laser_data)
        self.laser_data_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = LaserRelayNode()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
