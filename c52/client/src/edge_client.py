import grpc
import docker
import psutil
import socket
import uuid
import yaml
import time
import json
import logging
import os
from datetime import datetime
from concurrent import futures

import edge_pb2
import edge_pb2_grpc

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class EdgeClient:
    def __init__(self, server_addr, config_file='config.yaml'):
        self.server_addr = server_addr
        self.config_file = config_file
        self.node_id = self._get_node_id()
        self.hostname = socket.gethostname()
        self.node_ip = self._get_node_ip()
        self.current_config_version = self._load_config_version()
        self.config_version_file = '/etc/edge_config_version'
        self.docker_client = docker.from_env()
        self.channel = None
        self.stub = None
        self.running_containers = {}
        
        logger.info(f"Edge Client initialized - Node ID: {self.node_id}, Host: {self.hostname}, IP: {self.node_ip}, Current Version: {self.current_config_version}")

    def _get_node_id(self):
        node_id_file = '/etc/edge_node_id'
        if os.path.exists(node_id_file):
            with open(node_id_file, 'r') as f:
                return f.read().strip()
        
        new_id = str(uuid.uuid4())
        os.makedirs(os.path.dirname(node_id_file), exist_ok=True)
        with open(node_id_file, 'w') as f:
            f.write(new_id)
        return new_id

    def _get_node_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"

    def _load_config_version(self):
        version_file = '/etc/edge_config_version'
        if os.path.exists(version_file):
            try:
                with open(version_file, 'r') as f:
                    version = int(f.read().strip())
                    logger.info(f"Loaded persisted config version: {version}")
                    return version
            except Exception as e:
                logger.warning(f"Failed to load config version: {e}")
        return 0

    def _save_config_version(self, version):
        version_file = '/etc/edge_config_version'
        try:
            os.makedirs(os.path.dirname(version_file), exist_ok=True)
            with open(version_file, 'w') as f:
                f.write(str(version))
            logger.info(f"Persisted config version: {version}")
        except Exception as e:
            logger.warning(f"Failed to save config version: {e}")

    def _report_config_ack(self, version, success, error_message=""):
        try:
            request = edge_pb2.ConfigAckRequest(
                node_id=self.node_id,
                version=version,
                success=success,
                error_message=error_message,
                timestamp=int(time.time())
            )
            response = self.stub.ReportConfigAck(request)
            logger.info(f"Config Ack reported - version: {version}, success: {success}, accepted: {response.accepted}")
            return response.accepted
        except Exception as e:
            logger.error(f"Failed to report config ack: {e}")
            return False

    def connect(self):
        self.channel = grpc.insecure_channel(self.server_addr)
        self.stub = edge_pb2_grpc.EdgeServiceStub(self.channel)
        logger.info(f"Connected to gRPC server: {self.server_addr}")

    def get_config(self):
        try:
            request = edge_pb2.ConfigRequest(
                node_id=self.node_id,
                current_version=self.current_config_version,
                node_ip=self.node_ip,
                hostname=self.hostname
            )
            response = self.stub.GetConfig(request)
            
            if response.force_sync:
                logger.warning(f"Force sync requested by server. Current version: {self.current_config_version}")
            
            if response.has_update and response.config:
                logger.info(f"Received config version: {response.config.version}")
                return response.config
            elif response.has_update:
                logger.info("Config update available, but no config data")
            else:
                logger.info("No config update available")
            
            return None
        except Exception as e:
            logger.error(f"Failed to get config: {e}")
            return None

    def _get_resource_usage(self):
        cpu_usage = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        try:
            load_avg = psutil.getloadavg()[0]
        except:
            load_avg = 0.0

        return edge_pb2.ResourceUsage(
            cpu_usage=cpu_usage,
            memory_usage=memory.used,
            memory_total=memory.total,
            disk_usage=disk.used,
            disk_total=disk.total,
            load_average=load_avg
        )

    def _get_container_status(self):
        containers = []
        try:
            for container in self.docker_client.containers.list(all=True):
                try:
                    status = edge_pb2.ContainerStatus(
                        name=container.name,
                        image=container.image.tags[0] if container.image.tags else container.image.id,
                        status=container.status,
                        state=json.dumps(container.attrs.get('State', {})),
                        restart_count=container.attrs.get('RestartCount', 0),
                        created_at=int(datetime.strptime(
                            container.attrs['Created'].split('.')[0],
                            '%Y-%m-%dT%H:%M:%S'
                        ).timestamp()),
                        error=container.attrs.get('State', {}).get('Error', '')
                    )
                    containers.append(status)
                except Exception as e:
                    logger.warning(f"Failed to get status for container {container.name}: {e}")
        except Exception as e:
            logger.error(f"Failed to list containers: {e}")
        
        return containers

    def report_heartbeat(self, status="running"):
        try:
            resource_usage = self._get_resource_usage()
            containers = self._get_container_status()
            
            request = edge_pb2.HeartbeatRequest(
                node_id=self.node_id,
                node_ip=self.node_ip,
                hostname=self.hostname,
                resource_usage=resource_usage,
                containers=containers,
                timestamp=int(time.time()),
                status=status
            )
            
            response = self.stub.ReportHeartbeat(request)
            logger.info(f"Heartbeat reported - Accepted: {response.accepted}, Next heartbeat: {response.next_heartbeat}s")
            
            if response.config_updated:
                logger.info("Config updated flag received, will fetch new config")
            
            return response.next_heartbeat if response.next_heartbeat > 0 else 30
        except Exception as e:
            logger.error(f"Failed to report heartbeat: {e}")
            return 30

    def _apply_container_config(self, container_config):
        name = container_config.name
        logger.info(f"Applying config for container: {name}")
        
        try:
            existing = None
            try:
                existing = self.docker_client.containers.get(name)
            except docker.errors.NotFound:
                pass
            
            if existing:
                logger.info(f"Container {name} exists, checking for updates")
                current_image = existing.image.tags[0] if existing.image.tags else existing.image.id
                if current_image != container_config.image:
                    logger.info(f"Image changed for {name}: {current_image} -> {container_config.image}")
                    existing.stop()
                    existing.remove()
                    existing = None
                elif existing.status not in ['running', 'restarting']:
                    logger.info(f"Container {name} is {existing.status}, restarting")
                    existing.start()
                    return True
                else:
                    logger.info(f"Container {name} is already running with correct image")
                    return True
            
            logger.info(f"Pulling image: {container_config.image}")
            self.docker_client.images.pull(container_config.image)
            
            port_bindings = {}
            for port in container_config.ports:
                if ':' in port:
                    host_port, container_port = port.split(':', 1)
                    port_bindings[f"{container_port}/tcp"] = int(host_port)
                else:
                    port_bindings[f"{port}/tcp"] = None
            
            volumes = {}
            for vol in container_config.volumes:
                if ':' in vol:
                    host_path, container_path = vol.split(':', 1)
                    volumes[host_path] = {'bind': container_path, 'mode': 'rw'}
            
            host_config = self.docker_client.api.create_host_config(
                port_bindings=port_bindings,
                binds=volumes if volumes else None,
                cpu_quota=int(container_config.cpu_limit * 100000) if container_config.cpu_limit > 0 else None,
                mem_limit=container_config.memory_limit if container_config.memory_limit > 0 else None,
                restart_policy={'Name': container_config.restart_policy} if container_config.restart_policy else None
            )
            
            container = self.docker_client.api.create_container(
                image=container_config.image,
                name=name,
                environment=dict(container_config.env),
                host_config=host_config
            )
            
            self.docker_client.api.start(container.get('Id'))
            logger.info(f"Container {name} started successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to apply container config for {name}: {e}")
            return False

    def apply_config(self, config):
        if not config:
            return False
        
        version_to_apply = config.version
        logger.info(f"Applying config version {version_to_apply}")
        
        configured_containers = set()
        all_successful = True
        failed_containers = []
        
        for container_config in config.containers:
            configured_containers.add(container_config.name)
            success = self._apply_container_config(container_config)
            if not success:
                all_successful = False
                failed_containers.append(container_config.name)
        
        try:
            all_containers = self.docker_client.containers.list(all=True)
            for container in all_containers:
                if container.name not in configured_containers and container.name.startswith('edge_'):
                    logger.info(f"Removing extra container: {container.name}")
                    container.stop()
                    container.remove()
        except Exception as e:
            logger.error(f"Failed to clean up extra containers: {e}")
            all_successful = False
        
        if all_successful:
            self.current_config_version = version_to_apply
            self._save_config_version(version_to_apply)
            self._report_config_ack(version_to_apply, True)
            logger.info(f"Successfully applied config version {version_to_apply}")
            return True
        else:
            error_msg = f"Failed to apply containers: {', '.join(failed_containers)}"
            logger.error(f"Config version {version_to_apply} application failed: {error_msg}")
            self._report_config_ack(version_to_apply, False, error_msg)
            return False

    def run(self):
        self.connect()
        
        try:
            while True:
                config = self.get_config()
                if config:
                    self.apply_config(config)
                
                next_interval = self.report_heartbeat()
                
                logger.info(f"Sleeping for {next_interval} seconds")
                time.sleep(next_interval)
                
        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        finally:
            if self.channel:
                self.channel.close()
            logger.info("Edge Client stopped")


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Edge Client')
    parser.add_argument('--server', default='localhost:50051', help='gRPC server address')
    parser.add_argument('--config', default='config.yaml', help='Config file path')
    args = parser.parse_args()
    
    client = EdgeClient(args.server, args.config)
    client.run()
