import streamlit as st
import os
from code_smell_service import CodeSmellService
from llm_suggester import CodeSuggester, FeedbackStore


st.set_page_config(
    page_title="代码异味检测系统",
    page_icon="🔍",
    layout="wide"
)


def get_service():
    if 'service' not in st.session_state:
        st.session_state.service = CodeSmellService(use_local_embeddings=True)
    return st.session_state.service


def get_suggester():
    if 'suggester' not in st.session_state:
        st.session_state.suggester = CodeSuggester(use_local=True)
    return st.session_state.suggester


def get_feedback_store():
    if 'feedback_store' not in st.session_state:
        st.session_state.feedback_store = FeedbackStore()
    return st.session_state.feedback_store


service = get_service()
suggester = get_suggester()
feedback_store = get_feedback_store()


if 'indexed_count' not in st.session_state:
    st.session_state.indexed_count = service.get_indexed_count()
if 'last_repo' not in st.session_state:
    st.session_state.last_repo = ""
if 'current_suggestion' not in st.session_state:
    st.session_state.current_suggestion = None
if 'current_result' not in st.session_state:
    st.session_state.current_result = None


st.title("🔍 代码异味检测系统")


st.sidebar.header("仓库设置")
repo_url = st.sidebar.text_input(
    "GitHub 仓库 URL",
    placeholder="https://github.com/username/repo.git",
    value=st.session_state.last_repo
)

if st.sidebar.button("扫描仓库", type="primary"):
    if repo_url:
        progress_bar = st.sidebar.progress(0)
        status_text = st.sidebar.empty()
        
        status_text.text("正在克隆仓库...")
        progress_bar.progress(10)
        
        try:
            from repo_scanner import RepoScanner
            scanner = RepoScanner()
            
            repo_path = scanner.clone_repo(repo_url)
            progress_bar.progress(25)
            
            status_text.text("查找 Python 文件...")
            python_files = scanner.find_python_files(repo_path)
            progress_bar.progress(35)
            
            status_text.text(f"解析 {len(python_files)} 个 Python 文件...")
            from function_extractor import FunctionExtractor
            extractor = FunctionExtractor()
            functions = extractor.extract_all_functions(python_files, repo_path)
            progress_bar.progress(50)
            
            if not functions:
                st.sidebar.error("未找到 Python 函数")
                progress_bar.empty()
                status_text.empty()
            else:
                status_text.text(f"为 {len(functions)} 个函数生成 Embedding...")
                codes = [f['code'] for f in functions]
                embeddings = service.embedding_generator.generate_embeddings_batch(codes)
                progress_bar.progress(75)
                
                status_text.text("建立索引...")
                service.index.clear_collection()
                count = service.index.index_functions(functions, embeddings)
                progress_bar.progress(100)
                
                st.session_state.indexed_count = count
                st.session_state.last_repo = repo_url
                
                status_text.empty()
                progress_bar.empty()
                st.sidebar.success(f"成功索引 {count} 个函数")
                st.rerun()
        
        except Exception as e:
            st.sidebar.error(f"处理仓库时出错: {str(e)}")
            progress_bar.empty()
            status_text.empty()
        finally:
            scanner.cleanup()
    else:
        st.sidebar.warning("请输入仓库 URL")


st.sidebar.metric("已索引函数数量", st.session_state.indexed_count)


feedback_stats = feedback_store.get_feedback_stats()
st.sidebar.markdown("---")
st.sidebar.markdown("### 反馈统计")
col1, col2 = st.sidebar.columns(2)
col1.metric("总反馈", feedback_stats['total'])
col2.metric("有用反馈", feedback_stats['useful'])


st.sidebar.markdown("---")
st.sidebar.markdown("### 预设异味描述")

preset_smells = [
    "长函数 代码行数过多",
    "重复代码 相似逻辑",
    "过多参数 函数参数太多",
    "复杂条件判断 嵌套过深",
    "命名不清晰 变量名没有意义",
    "魔法数字 硬编码的数字",
    "过长的类 职责太多"
]

selected_preset = st.sidebar.selectbox("选择预设", [""] + preset_smells)


st.header("异味搜索")
col1, col2 = st.columns([4, 1])

with col1:
    if selected_preset:
        smell_query = st.text_input(
            "输入代码异味描述",
            value=selected_preset,
            placeholder="例如：长函数、重复代码、过多参数..."
        )
    else:
        smell_query = st.text_input(
            "输入代码异味描述",
            placeholder="例如：长函数、重复代码、过多参数..."
        )

with col2:
    result_count = st.number_input("结果数量", min_value=1, max_value=20, value=5)


if st.button("搜索", type="primary"):
    st.session_state.current_suggestion = None
    st.session_state.current_result = None
    
    if smell_query and st.session_state.indexed_count > 0:
        with st.spinner("正在搜索..."):
            results = service.search_smells(smell_query, result_count)
            
            st.subheader(f"找到 {len(results)} 个相关函数：")
            
            for i, result in enumerate(results, 1):
                metadata = result['metadata']
                
                with st.expander(
                    f"#{i} - {metadata['name']} "
                    f"(文件: {metadata['file']}, 行: {metadata['start_line']}-{metadata['end_line']})"
                    f" - 相似度: {1 - result['distance']:.2f}"
                ):
                    col_a, col_b = st.columns([1, 1])
                    
                    with col_a:
                        st.markdown("**函数信息**")
                        st.write(f"函数名: `{metadata['name']}`")
                        st.write(f"文件: `{metadata['file']}`")
                        st.write(f"行号: {metadata['start_line']} - {metadata['end_line']}")
                        st.write(f"参数数量: {metadata['param_count']}")
                        st.write(f"代码行数: {metadata['line_count']}")
                        st.write(f"相似度分数: {(1 - result['distance']) * 100:.1f}%")
                        if 'feedback_weight' in result and result['feedback_weight'] != 1.0:
                            st.write(f"反馈权重: {result['feedback_weight']:.2f}x")
                    
                    with col_b:
                        st.markdown("**代码**")
                        st.code(metadata.get('code', ''), language='python')
                    
                    if metadata['line_count'] > 30 or '长函数' in smell_query:
                        st.markdown("---")
                        col_suggest, col_btn = st.columns([4, 1])
                        
                        with col_btn:
                            if st.button(f"🤖 获取修复建议", key=f"suggest_{i}"):
                                with st.spinner("正在生成修复建议..."):
                                    suggestion = suggester.suggest_long_function_refactor(
                                        metadata['name'],
                                        metadata.get('code', ''),
                                        smell_query
                                    )
                                    st.session_state.current_suggestion = suggestion
                                    st.session_state.current_result = {
                                        'id': result['id'],
                                        'metadata': metadata,
                                        'index': i
                                    }
                                    st.rerun()
                        
                        if st.session_state.current_suggestion and \
                           st.session_state.current_result and \
                           st.session_state.current_result['index'] == i:
                            
                            suggestion = st.session_state.current_suggestion
                            res = st.session_state.current_result
                            
                            st.markdown("### 💡 修复建议")
                            st.markdown(f"**问题**: {suggestion['problem']}")
                            st.markdown(f"**建议**: {suggestion['suggestion']}")
                            
                            if suggestion['steps']:
                                st.markdown("**重构步骤**:")
                                for step in suggestion['steps']:
                                    st.markdown(f"- {step}")
                            
                            st.markdown("**重构示例代码**:")
                            st.code(suggestion['refactored_code'], language='python')
                            
                            st.markdown("---")
                            st.markdown("**这个建议有用吗？**")
                            col_useful, col_not = st.columns(2)
                            
                            with col_useful:
                                if st.button("👍 有用", key=f"useful_{i}", type="secondary"):
                                    feedback_store.add_feedback(
                                        res['id'],
                                        res['metadata']['name'],
                                        res['metadata']['file'],
                                        res['metadata'].get('code', ''),
                                        suggestion,
                                        'useful'
                                    )
                                    st.success("感谢您的反馈！已提高该代码的检索权重。")
                                    st.session_state.current_suggestion = None
                                    st.session_state.current_result = None
                                    st.rerun()
                            
                            with col_not:
                                if st.button("👎 无用", key=f"notuseful_{i}", type="secondary"):
                                    feedback_store.add_feedback(
                                        res['id'],
                                        res['metadata']['name'],
                                        res['metadata']['file'],
                                        res['metadata'].get('code', ''),
                                        suggestion,
                                        'not_useful'
                                    )
                                    st.info("感谢您的反馈！已降低该代码的检索权重。")
                                    st.session_state.current_suggestion = None
                                    st.session_state.current_result = None
                                    st.rerun()
    else:
        if not smell_query:
            st.warning("请输入异味描述")
        if st.session_state.indexed_count == 0:
            st.warning("请先扫描一个仓库")


st.markdown("---")
st.markdown("### 使用说明")
st.markdown("""
1. 在左侧输入 GitHub 仓库 URL，点击"扫描仓库"
2. 系统会自动克隆仓库、提取 Python 函数、生成 Embedding 并建立索引
3. 在搜索框输入代码异味描述，或选择预设选项
4. 点击"搜索"查看最相似的函数
5. 对于长函数，可点击"获取修复建议"获得 LLM 生成的重构建议
6. 对建议进行反馈（有用/无用），系统会根据反馈调整检索权重
""")
