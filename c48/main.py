#!/usr/bin/env python3
import subprocess
import sys
import os


def install_dependencies():
    print("安装依赖...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    print("依赖安装完成！")


def build_index(code_path, index_path="./faiss_index"):
    from code_indexer import index_codebase
    index_codebase(code_path, index_path)


def update_index(code_path, index_path="./faiss_index"):
    from code_indexer import update_index
    update_index(code_path, index_path)


def search_index(index_path, query, k=5):
    from code_indexer import load_and_search
    load_and_search(index_path, query, k)


def run_streamlit():
    print("启动 Streamlit 界面...")
    subprocess.check_call([sys.executable, "-m", "streamlit", "run", "app.py"])


def print_stats(index_path):
    from code_indexer import IncrementalCodeIndexer
    indexer = IncrementalCodeIndexer()
    indexer.load_index(index_path)
    stats = indexer.get_index_stats()
    print("\n📊 索引统计:")
    print(f"  总文件数: {stats.get('total_files', 0)}")
    print(f"  总代码块: {stats.get('total_chunks', 0)}")
    print(f"  索引版本: {stats.get('index_version', '')}")
    print(f"  代码路径: {stats.get('code_path', '')}")


def print_usage():
    print("本地代码库语义搜索引擎 v2.0")
    print("=" * 45)
    print("用法:")
    print("  python main.py install                    # 安装依赖")
    print("  python main.py index <代码路径> [索引路径]  # 构建索引")
    print("  python main.py update <代码路径> [索引路径] # 增量更新索引")
    print("  python main.py search <索引路径> <查询语句> [结果数量] # 命令行搜索")
    print("  python main.py stats <索引路径>            # 查看索引统计")
    print("  python main.py web                         # 启动 Web 界面")
    print()
    print("示例:")
    print("  python main.py install")
    print("  python main.py index ./test_code ./faiss_index")
    print("  python main.py update ./test_code ./faiss_index")
    print("  python main.py search ./faiss_index \"用户登录\" 5")
    print("  python main.py stats ./faiss_index")
    print("  python main.py web")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "install":
        install_dependencies()
    
    elif command == "index":
        if len(sys.argv) < 3:
            print("用法: python main.py index <代码路径> [索引保存路径]")
            sys.exit(1)
        code_path = sys.argv[2]
        index_path = sys.argv[3] if len(sys.argv) > 3 else "./faiss_index"
        build_index(code_path, index_path)
    
    elif command == "update":
        if len(sys.argv) < 3:
            print("用法: python main.py update <代码路径> [索引路径]")
            sys.exit(1)
        code_path = sys.argv[2]
        index_path = sys.argv[3] if len(sys.argv) > 3 else "./faiss_index"
        update_index(code_path, index_path)
    
    elif command == "search":
        if len(sys.argv) < 4:
            print("用法: python main.py search <索引路径> <查询语句> [结果数量]")
            sys.exit(1)
        index_path = sys.argv[2]
        query = sys.argv[3]
        k = int(sys.argv[4]) if len(sys.argv) > 4 else 5
        search_index(index_path, query, k)
    
    elif command == "stats":
        if len(sys.argv) < 3:
            print("用法: python main.py stats <索引路径>")
            sys.exit(1)
        index_path = sys.argv[2]
        print_stats(index_path)
    
    elif command == "web":
        run_streamlit()
    
    else:
        print(f"未知命令: {command}")
        print_usage()
