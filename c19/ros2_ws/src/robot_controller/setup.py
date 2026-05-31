from setuptools import setup

package_name = 'robot_controller'

setup(
    name=package_name,
    version='0.0.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='ros',
    maintainer_email='ros@example.com',
    description='Robot controller with joystick and laser support',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'robot_controller_node = robot_controller.robot_controller_node:main',
            'laser_relay_node = robot_controller.laser_relay_node:main',
            'status_publisher_node = robot_controller.status_publisher_node:main',
            'simulation_node = robot_controller.simulation_node:main',
            'path_executor_node = robot_controller.path_executor_node:main',
        ],
    },
)
