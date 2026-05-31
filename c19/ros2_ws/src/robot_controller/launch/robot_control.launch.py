from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(
            package='robot_controller',
            executable='simulation_node',
            name='simulation_node',
            output='screen'
        ),
        Node(
            package='robot_controller',
            executable='robot_controller_node',
            name='robot_controller_node',
            output='screen'
        ),
        Node(
            package='robot_controller',
            executable='laser_relay_node',
            name='laser_relay_node',
            output='screen'
        ),
        Node(
            package='robot_controller',
            executable='status_publisher_node',
            name='status_publisher_node',
            output='screen'
        ),
        Node(
            package='robot_controller',
            executable='path_executor_node',
            name='path_executor_node',
            output='screen'
        )
    ])
