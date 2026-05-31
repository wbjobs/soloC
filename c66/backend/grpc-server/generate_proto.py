import os
import subprocess

def generate_proto():
    proto_dir = os.path.join(os.path.dirname(__file__), 'proto')
    output_dir = os.path.join(os.path.dirname(__file__), 'generated')
    os.makedirs(output_dir, exist_ok=True)
    
    command = [
        'python', '-m', 'grpc_tools.protoc',
        '-I' + proto_dir,
        '--python_out=' + output_dir,
        '--grpc_python_out=' + output_dir,
        'factor.proto'
    ]
    
    subprocess.run(command, check=True)
    print("gRPC code generated successfully!")

if __name__ == '__main__':
    generate_proto()
