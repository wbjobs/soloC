import streamlit as st
import os
from pathlib import Path
from code_indexer import IncrementalCodeIndexer

st.set_page_config(
    page_title="本地代码库语义搜索引擎",
    page_icon="🔍",
    layout="wide"
)

st.title("🔍 本地代码库语义搜索引擎")

if 'indexer' not in st.session_state:
    st.session_state.indexer = None
if 'index_loaded' not in st.session_state:
    st.session_state.index_loaded = False
if 'build_progress' not in st.session_state:
    st.session_state.build_progress = 0

with st.sidebar:
    st.header("⚙️ 设置")
    
    st.subheader("1. 构建索引")
    code_path = st.text_input("代码库路径", value="")
    index_save_path = st.text_input("索引保存路径", value="./faiss_index")
    
    batch_size = st.slider("批处理大小", min_value=10, max_value=200, value=50, 
                          help="较大的批处理速度快但占用更多内存")
    
    if st.button("构建索引", type="primary"):
        if code_path and os.path.exists(code_path):
            with st.spinner("正在扫描文件..."):
                try:
                    indexer = IncrementalCodeIndexer(batch_size=batch_size, index_path=index_save_path)
                    documents = indexer.traverse_directory(code_path)
                    
                    if len(documents) == 0:
                        st.error("没有找到支持的代码文件")
                    else:
                        st.info(f"找到 {len(documents)} 个代码文件")
                        
                        progress_bar = st.progress(0)
                        status_text = st.empty()
                        
                        def progress_callback(progress):
                            progress_bar.progress(progress)
                            status_text.text(f"索引进度: {progress:.1%}")
                        
                        indexer.build_index(documents, code_path, progress_callback, index_save_path)
                        indexer.save_index(index_save_path)
                        
                        st.session_state.indexer = indexer
                        st.session_state.index_loaded = True
                        progress_bar.progress(1.0)
                        status_text.text("索引构建完成！")
                        st.success(f"索引构建成功！已保存到 {index_save_path}")
                except Exception as e:
                    st.error(f"构建索引失败: {str(e)}")
        else:
            st.error("请输入有效的代码库路径")
    
    st.divider()
    
    st.subheader("2. 加载现有索引")
    load_index_path = st.text_input("索引路径", value="./faiss_index")
    
    if st.button("加载索引"):
        if os.path.exists(load_index_path):
            with st.spinner("正在加载索引..."):
                try:
                    indexer = IncrementalCodeIndexer()
                    indexer.load_index(load_index_path)
                    st.session_state.indexer = indexer
                    st.session_state.index_loaded = True
                    
                    stats = indexer.get_index_stats()
                    st.success(f"索引加载成功！包含 {stats['total_files']} 个文件，{stats['total_chunks']} 个代码块")
                except Exception as e:
                    st.error(f"加载索引失败: {str(e)}")
        else:
            st.error("索引路径不存在")
    
    st.divider()
    
    st.subheader("3. 增量更新索引")
    update_code_path = st.text_input("更新代码路径", value=st.session_state.indexer.code_path if st.session_state.index_loaded else "")
    
    if st.button("检测变更并更新", disabled=not st.session_state.index_loaded):
        if st.session_state.index_loaded:
            update_path = update_code_path or (st.session_state.indexer.code_path if st.session_state.indexer else "")
            if update_path and os.path.exists(update_path):
                with st.spinner("正在检测变更..."):
                    try:
                        changes = st.session_state.indexer.detect_changes(update_path)
                        
                        if sum(len(v) for v in changes.values()) == 0:
                            st.info("未检测到代码变更")
                        else:
                            st.info(f"检测到变更: 新增 {len(changes['added'])}, 修改 {len(changes['modified'])}, 删除 {len(changes['deleted'])}")
                            
                            progress_bar = st.progress(0)
                            status_text = st.empty()
                            
                            def update_progress(progress):
                                progress_bar.progress(progress)
                                status_text.text(f"更新进度: {progress:.1%}")
                            
                            stats = st.session_state.indexer.update_index(update_path, progress_callback=update_progress)
                            st.session_state.indexer.save_index()
                            
                            progress_bar.progress(1.0)
                            status_text.text("更新完成！")
                            
                            st.success(f"""增量更新完成！
                            - 新增代码块: {stats['added']}
                            - 修改代码块: {stats['modified']}
                            - 删除代码块: {stats['deleted']}
                            """)
                    except Exception as e:
                        st.error(f"更新索引失败: {str(e)}")
            else:
                st.error("请输入有效的代码路径")
    
    st.divider()
    
    st.subheader("📋 状态")
    if st.session_state.index_loaded:
        st.success("✅ 索引已加载，可进行查询")
        
        stats = st.session_state.indexer.get_index_stats()
        st.json({
            "总文件数": stats.get('total_files', 0),
            "总代码块": stats.get('total_chunks', 0),
            "索引版本": stats.get('index_version', ''),
            "代码路径": stats.get('code_path', '')
        })
    else:
        st.warning("⚠️ 请先构建或加载索引")

st.header("🔎 代码搜索")

query = st.text_input("输入查询语句", placeholder="例如：如何实现用户登录验证")

col1, col2, col3, col4 = st.columns([1, 1, 1, 2])
with col1:
    k = st.number_input("返回结果数量", min_value=1, max_value=20, value=5)
with col2:
    use_mmr = st.checkbox("使用MMR去重", value=True, help="最大化边际相关性，减少重复结果")
with col3:
    use_rerank = st.checkbox("关键词重排序", value=True, help="基于查询关键词重排序提高相关性")

if st.button("搜索", type="primary", disabled=not st.session_state.index_loaded):
    if query and st.session_state.index_loaded:
        with st.spinner("正在搜索..."):
            try:
                results = st.session_state.indexer.search_with_scores(
                    query, k=k, use_mmr=use_mmr, use_rerank=use_rerank
                )
                
                if len(results) == 0:
                    st.info("没有找到相关代码")
                else:
                    st.success(f"找到 {len(results)} 个相关代码块")
                    
                    for i, (doc, score) in enumerate(results, 1):
                        similarity = 1 - score
                        
                        with st.expander(
                            f"结果 {i} - 相似度: {similarity:.2%} - {doc.metadata['source']}",
                            expanded=(i == 1)
                        ):
                            col_a, col_b = st.columns([1, 3])
                            with col_a:
                                st.write(f"**文件**: {doc.metadata['source']}")
                                st.write(f"**语言**: {doc.metadata['language']}")
                                st.write(f"**文件名**: {doc.metadata['file_name']}")
                                if doc.metadata.get('classes'):
                                    st.write(f"**类**: {doc.metadata['classes']}")
                                if doc.metadata.get('functions'):
                                    st.write(f"**函数**: {doc.metadata['functions']}")
                            
                            language_map = {
                                'Python': 'python',
                                'JavaScript': 'javascript',
                                'Go': 'go'
                            }
                            lang = language_map.get(doc.metadata['language'], 'text')
                            
                            content = doc.page_content
                            if '\n\n' in content:
                                content = content.split('\n\n', 1)[-1]
                            
                            st.code(content, language=lang)
            except Exception as e:
                st.error(f"搜索失败: {str(e)}")
    elif not st.session_state.index_loaded:
        st.warning("请先构建或加载索引")
    else:
        st.warning("请输入查询语句")

st.divider()

st.subheader("📝 使用说明")
st.markdown("""
### 性能优化
- **批处理大小**: 较大的批处理速度更快但占用更多内存，建议50-100
- **自动跳过**: 自动跳过 node_modules、.git、__pycache__ 等目录
- **文件限制**: 自动跳过超过5MB的大文件

### 增量更新
- **检测变更**: 自动检测新增、修改、删除的文件
- **增量索引**: 只处理变更的文件，大大提高更新速度
- **元数据追踪**: 基于MD5哈希值检测文件内容变更

### 搜索优化
- **MMR去重**: 减少重复或非常相似的代码片段，提高结果多样性
- **关键词重排序**: 基于查询关键词匹配度重排序，提高相关性
- **代码感知分块**: 按编程语言语法分块，保留函数、类上下文

### 支持的编程语言
Python (.py), JavaScript (.js, .ts, .jsx, .tsx), Go (.go)
""")
