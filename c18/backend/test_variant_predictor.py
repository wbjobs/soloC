import sys
sys.path.insert(0, '.')

from app.services.variant_predictor import VariantPredictor
from app.utils.sequence_analyzer import SequenceAnalyzer

reference = 'ATGGCCAAGAACATCCACGCCTTCATCCACCTGACCGAGGACCTGGAGTTCTTCGAGTACTGCGGAGTGGAGCTGAAGAAGTACGTGAATGCCAGCCCGGAGCAGTACGGCCAGATCGAGACGTCGTGCATGGAGATGGGCAAGATCGAGTGCATGGAGGAGAAGCTGCGCGCGGACATGTATGTGGCCTTTGAGGTGAAGTACATCCGCCGCATCCACTACAAGGTGGACATCGACCGCACCCAGGAGGCCTACGGGTGGAACAAGCGCGAGGTGATCGAGATCGGCGACGCCAAGAAGCTGTGCGACGTGATCAAGCAGTCCATGCGCGAGTATGTGGACGTGGTGAAGAAGGACGAGGCCAAGAAGATCGAGCGCCACATCCAGGGCGAGTACTCCGTGAAGATCTACGTGGCCGAGAACGGCGTGCGGCGGCGCTGA'

predictor = VariantPredictor()
analyzer = SequenceAnalyzer()

print('=' * 60)
print('测试序列分析')
print('=' * 60)
features = analyzer.extract_sequence_features(reference)
print(f'序列长度: {features["length"]}')
print(f'GC含量: {features["gc_content"]:.2%}')
print(f'是DNA: {features["is_dna"]}')
print()

print('=' * 60)
print('测试变异预测（无变体序列）')
print('=' * 60)
result = predictor.predict_variants(reference)
print(f'总变异数: {result["summary"]["total_variants"]}')
print(f'风险等级: {result["summary"]["overall_risk"]}')
print()
print('按严重程度分类:')
for severity, count in result['summary']['by_severity'].items():
    print(f'  - {severity}: {count}')
print()
print('按类型分类:')
for type_, count in result['summary']['by_type'].items():
    print(f'  - {type_}: {count}')
print()
print('前5个变异:')
for i, var in enumerate(result['variants'][:5]):
    print(f'  {i+1}. 位置 {var["position"]}: {var["type"]} - {var["effect"]["description"]}')
