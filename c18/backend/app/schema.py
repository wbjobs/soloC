import graphene
from graphene_file_upload.scalars import Upload
import logging
import json
from .utils.cache import CacheManager

def get_service_factory():
    from .services.service_factory import ServiceFactory
    return ServiceFactory

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_NESTING_DEPTH = 4
MAX_BATCH_SIZE = 100

class QueryComplexityMiddleware:
    def resolve(self, next, root, info, **args):
        depth = self._get_depth(info)
        if depth > MAX_NESTING_DEPTH:
            raise ValueError(f"Query nesting too deep. Maximum depth: {MAX_NESTING_DEPTH}")
        return next(root, info, **args)
    
    @staticmethod
    def _get_depth(info):
        depth = 0
        if hasattr(info, 'path') and info.path:
            current = info.path
            while current is not None:
                depth += 1
                if hasattr(current, 'prev'):
                    current = current.prev
                else:
                    break
        return depth

class Sequence(graphene.ObjectType):
    id = graphene.ID()
    name = graphene.String()
    description = graphene.String()
    sequence = graphene.String()
    length = graphene.Int()
    
    class Meta:
        description = "A biological sequence with metadata"

class BlastHit(graphene.ObjectType):
    query_id = graphene.String()
    subject_id = graphene.String()
    identity = graphene.Float()
    alignment_length = graphene.Int()
    mismatches = graphene.Int()
    gap_opens = graphene.Int()
    q_start = graphene.Int()
    q_end = graphene.Int()
    s_start = graphene.Int()
    s_end = graphene.Int()
    evalue = graphene.Float()
    bit_score = graphene.Float()
    subject_title = graphene.String()
    
    class Meta:
        description = "A single BLAST alignment hit"

class BlastResult(graphene.ObjectType):
    query_sequence = graphene.Field(Sequence)
    hits = graphene.List(
        BlastHit,
        limit=graphene.Int(default_value=50),
        offset=graphene.Int(default_value=0),
        min_identity=graphene.Float(default_value=0.0),
        max_evalue=graphene.Float(default_value=10.0)
    )
    total_hits = graphene.Int()
    execution_time = graphene.Float()
    
    class Meta:
        description = "Complete BLAST analysis result"
    
    def resolve_hits(self, info, limit=50, offset=0, min_identity=0.0, max_evalue=10.0):
        if not hasattr(self, '_all_hits'):
            return []
        
        limit = min(limit, MAX_BATCH_SIZE)
        
        filtered = [
            hit for hit in self._all_hits
            if hit.identity >= min_identity and hit.evalue <= max_evalue
        ]
        
        return filtered[offset:offset + limit]

class FastaUploadResult(graphene.ObjectType):
    success = graphene.Boolean()
    message = graphene.String()
    sequences = graphene.List(
        Sequence,
        limit=graphene.Int(default_value=100),
        offset=graphene.Int(default_value=0)
    )
    file_path = graphene.String()
    count = graphene.Int()
    
    def resolve_sequences(self, info, limit=100, offset=0):
        if not self.sequences:
            return []
        
        limit = min(limit, MAX_BATCH_SIZE)
        return self.sequences[offset:offset + limit]

class SequenceStats(graphene.ObjectType):
    length = graphene.Int()
    is_dna = graphene.Boolean()
    a_content = graphene.Float()
    t_content = graphene.Float()
    g_content = graphene.Float()
    c_content = graphene.Float()
    gc_content = graphene.Float()
    at_content = graphene.Float()
    protein_length = graphene.Int()
    has_stop_codon = graphene.Boolean()
    hydrophobicity = graphene.Float()
    molecular_weight = graphene.Float()
    isoelectric_point = graphene.Float()

class CpgIsland(graphene.ObjectType):
    start = graphene.Int()
    end = graphene.Int()
    gc_content = graphene.Float()
    cg_ratio = graphene.Float()

class RepeatRegion(graphene.ObjectType):
    unit = graphene.String()
    start = graphene.Int()
    end = graphene.Int()
    count = graphene.Int()
    length = graphene.Int()

class SequenceAnalysis(graphene.ObjectType):
    stats = graphene.Field(SequenceStats)
    cpg_islands = graphene.List(CpgIsland)
    repeat_regions = graphene.List(RepeatRegion)
    stability = graphene.JSONString()
    protein_sequence = graphene.String()

class MutationEffect(graphene.ObjectType):
    description = graphene.String()
    severity = graphene.String()

class Variant(graphene.ObjectType):
    type = graphene.String()
    position = graphene.Int()
    ref_nucleotide = graphene.String()
    var_nucleotide = graphene.String()
    ref_amino_acid = graphene.String()
    var_amino_acid = graphene.String()
    codon_position = graphene.Int()
    ref_codon = graphene.String()
    var_codon = graphene.String()
    effect = graphene.Field(MutationEffect)
    impact_score = graphene.Float()
    severity = graphene.String()
    probability = graphene.Float()
    clinical_significance = graphene.String()
    blosum62_score = graphene.Int()
    conservation_type = graphene.String()
    indel_length = graphene.Int()
    indel_type = graphene.String()
    glutamine_count = graphene.Int()
    risk_category = graphene.String()
    splice_type = graphene.String()
    context_sequence = graphene.String()
    gc_content = graphene.Float()

class VariantSummary(graphene.ObjectType):
    total_variants = graphene.Int()
    by_severity = graphene.JSONString()
    by_type = graphene.JSONString()
    average_impact = graphene.Float()
    overall_risk = graphene.String()

class ReferenceInfo(graphene.ObjectType):
    sequence = graphene.String()
    protein = graphene.String()
    length = graphene.Int()
    protein_length = graphene.Int()

class VariantPrediction(graphene.ObjectType):
    reference = graphene.Field(ReferenceInfo)
    variants = graphene.List(
        Variant,
        limit=graphene.Int(default_value=50),
        offset=graphene.Int(default_value=0),
        min_impact=graphene.Float(default_value=0.0),
        severity_filter=graphene.String(default_value="all")
    )
    summary = graphene.Field(VariantSummary)
    recommendations = graphene.List(graphene.String)
    sequence_analysis = graphene.Field(SequenceAnalysis)
    
    def resolve_variants(self, info, limit=50, offset=0, min_impact=0.0, severity_filter="all"):
        if not hasattr(self, '_all_variants'):
            return []
        
        limit = min(limit, MAX_BATCH_SIZE)
        
        filtered = []
        for variant in self._all_variants:
            if variant.get('impact_score', 0) < min_impact:
                continue
            if severity_filter != "all" and variant.get('severity') != severity_filter:
                continue
            filtered.append(variant)
        
        result = filtered[offset:offset + limit]
        
        return [
            Variant(
                type=v.get('type'),
                position=v.get('position'),
                ref_nucleotide=v.get('ref_nucleotide'),
                var_nucleotide=v.get('var_nucleotide'),
                ref_amino_acid=v.get('ref_amino_acid'),
                var_amino_acid=v.get('var_amino_acid'),
                codon_position=v.get('codon_position'),
                ref_codon=v.get('ref_codon'),
                var_codon=v.get('var_codon'),
                effect=MutationEffect(
                    description=v.get('effect', {}).get('description'),
                    severity=v.get('effect', {}).get('severity')
                ) if v.get('effect') else None,
                impact_score=v.get('impact_score'),
                severity=v.get('severity'),
                probability=v.get('probability'),
                clinical_significance=v.get('clinical_significance'),
                blosum62_score=v.get('blosum62_score'),
                conservation_type=v.get('conservation_type'),
                indel_length=v.get('indel_length'),
                indel_type=v.get('indel_type'),
                glutamine_count=v.get('glutamine_count'),
                risk_category=v.get('risk_category'),
                splice_type=v.get('splice_type'),
                context_sequence=v.get('context_sequence'),
                gc_content=v.get('gc_content')
            )
            for v in result
        ]

class Query(graphene.ObjectType):
    hello = graphene.String(name=graphene.String(default_value="World"))
    
    analyze_sequence = graphene.Field(
        BlastResult,
        sequence=graphene.String(required=True),
        program=graphene.String(default_value="blastn"),
        database=graphene.String(default_value="nr"),
        evalue=graphene.Float(default_value=10.0),
        max_hits=graphene.Int(default_value=50)
    )
    
    parse_fasta = graphene.Field(
        FastaUploadResult,
        file_path=graphene.String(required=True)
    )
    
    cached_queries = graphene.Int(description="Number of cached BLAST queries")
    
    analyze_sequence_features = graphene.Field(
        SequenceAnalysis,
        sequence=graphene.String(required=True)
    )
    
    predict_variants = graphene.Field(
        VariantPrediction,
        reference_sequence=graphene.String(required=True),
        variant_sequence=graphene.String()
    )
    
    analyze_sequence_stability = graphene.JSONString(
        sequence=graphene.String(required=True)
    )
    
    def resolve_hello(self, info, name):
        return f"Hello {name}! Welcome to Gene Sequence Analysis Platform"
    
    def resolve_analyze_sequence(self, info, sequence, program, database, evalue, max_hits):
        if len(sequence) > 50000:
            raise ValueError(f"Sequence too long. Maximum 50,000 characters allowed")
        
        factory = get_service_factory()
        blast_service = factory.get_blast_service()
        result = blast_service.run_blast(
            sequence=sequence,
            program=program,
            database=database,
            evalue=evalue,
            max_hits=max_hits
        )
        
        if hasattr(result, 'hits'):
            result._all_hits = list(result.hits)
        
        return result
    
    def resolve_parse_fasta(self, info, file_path):
        if not file_path or len(file_path) > 500:
            raise ValueError("Invalid file path")
        
        cache_manager = CacheManager()
        cached = cache_manager.get_fasta(file_path)
        if cached:
            logger.info("Using cached FASTA result")
            return cached
        
        factory = get_service_factory()
        handler = factory.get_fasta_handler()
        result = handler.parse_fasta_file(file_path)
        
        if result.success:
            cache_manager.set_fasta(file_path, result)
        
        return result
    
    def resolve_cached_queries(self, info):
        cache_manager = CacheManager()
        return len(cache_manager.blast_cache.cache)
    
    def resolve_analyze_sequence_features(self, info, sequence):
        if not sequence or len(sequence.strip()) < 10:
            raise ValueError("Sequence too short. Minimum 10 characters required.")
        
        factory = get_service_factory()
        analyzer = factory.get_sequence_analyzer()
        features = analyzer.extract_sequence_features(sequence)
        cpg_islands = analyzer.find_cpg_islands(sequence)
        repeats = analyzer.find_repeat_regions(sequence)
        stability = analyzer.analyze_sequence_stability(sequence)
        
        protein = analyzer.translate_sequence(sequence)
        
        stats = SequenceStats(
            length=features.get('length'),
            is_dna=features.get('is_dna'),
            a_content=features.get('a_content'),
            t_content=features.get('t_content'),
            g_content=features.get('g_content'),
            c_content=features.get('c_content'),
            gc_content=features.get('gc_content'),
            at_content=features.get('at_content'),
            protein_length=features.get('protein_length'),
            has_stop_codon=features.get('has_stop_codon'),
            hydrophobicity=features.get('hydrophobicity'),
            molecular_weight=features.get('molecular_weight'),
            isoelectric_point=features.get('isoelectric_point')
        )
        
        return SequenceAnalysis(
            stats=stats,
            cpg_islands=[
                CpgIsland(start=i['start'], end=i['end'], gc_content=i['gc_content'], cg_ratio=i['cg_ratio'])
                for i in cpg_islands
            ],
            repeat_regions=[
                RepeatRegion(unit=r['unit'], start=r['start'], end=r['end'], count=r['count'], length=r['length'])
                for r in repeats
            ],
            stability=json.dumps(stability),
            protein_sequence=protein
        )
    
    def resolve_predict_variants(self, info, reference_sequence, variant_sequence=None):
        if not reference_sequence or len(reference_sequence.strip()) < 10:
            raise ValueError("Reference sequence too short. Minimum 10 characters required.")
        
        factory = get_service_factory()
        predictor = factory.get_variant_predictor()
        analyzer = factory.get_sequence_analyzer()
        
        result = predictor.predict_variants(reference_sequence, variant_sequence)
        
        variant_prediction = VariantPrediction()
        variant_prediction._all_variants = result.get('variants', [])
        
        variant_prediction.reference = ReferenceInfo(
            sequence=result['reference']['sequence'],
            protein=result['reference']['protein'],
            length=result['reference']['length'],
            protein_length=result['reference']['protein_length']
        )
        
        summary = result.get('summary', {})
        variant_prediction.summary = VariantSummary(
            total_variants=summary.get('total_variants', 0),
            by_severity=json.dumps(summary.get('by_severity', {})),
            by_type=json.dumps(summary.get('by_type', {})),
            average_impact=summary.get('average_impact', 0.0),
            overall_risk=summary.get('overall_risk', 'low')
        )
        
        variant_prediction.recommendations = result.get('recommendations', [])
        
        features = analyzer.extract_sequence_features(reference_sequence)
        cpg_islands = analyzer.find_cpg_islands(reference_sequence)
        repeats = analyzer.find_repeat_regions(reference_sequence)
        stability = analyzer.analyze_sequence_stability(reference_sequence)
        protein = analyzer.translate_sequence(reference_sequence)
        
        variant_prediction.sequence_analysis = SequenceAnalysis(
            stats=SequenceStats(
                length=features.get('length'),
                is_dna=features.get('is_dna'),
                a_content=features.get('a_content'),
                t_content=features.get('t_content'),
                g_content=features.get('g_content'),
                c_content=features.get('c_content'),
                gc_content=features.get('gc_content'),
                at_content=features.get('at_content'),
                protein_length=features.get('protein_length'),
                has_stop_codon=features.get('has_stop_codon'),
                hydrophobicity=features.get('hydrophobicity'),
                molecular_weight=features.get('molecular_weight'),
                isoelectric_point=features.get('isoelectric_point')
            ),
            cpg_islands=[
                CpgIsland(start=i['start'], end=i['end'], gc_content=i['gc_content'], cg_ratio=i['cg_ratio'])
                for i in cpg_islands
            ],
            repeat_regions=[
                RepeatRegion(unit=r['unit'], start=r['start'], end=r['end'], count=r['count'], length=r['length'])
                for r in repeats
            ],
            stability=json.dumps(stability),
            protein_sequence=protein
        )
        
        return variant_prediction
    
    def resolve_analyze_sequence_stability(self, info, sequence):
        if not sequence or len(sequence.strip()) < 10:
            raise ValueError("Sequence too short. Minimum 10 characters required.")
        
        factory = get_service_factory()
        predictor = factory.get_variant_predictor()
        return json.dumps(predictor.analyze_sequence_stability(sequence))

class UploadFasta(graphene.Mutation):
    class Arguments:
        file = Upload(required=True)

    Output = FastaUploadResult

    def mutate(self, info, file):
        factory = get_service_factory()
        handler = factory.get_fasta_handler()
        return handler.upload_and_parse(file)

class RunBlast(graphene.Mutation):
    class Arguments:
        sequence_id = graphene.String(required=True)
        sequence = graphene.String(required=True)
        program = graphene.String(default_value="blastn")
        database = graphene.String(default_value="nr")
        evalue = graphene.Float(default_value=10.0)
        max_hits = graphene.Int(default_value=50)

    Output = BlastResult

    def mutate(self, info, sequence_id, sequence, program, database, evalue, max_hits):
        if not sequence or len(sequence.strip()) == 0:
            raise ValueError("Sequence cannot be empty")
        
        if len(sequence) > 50000:
            raise ValueError(f"Sequence too long ({len(sequence)} chars). Maximum 50,000 characters allowed")
        
        factory = get_service_factory()
        blast_service = factory.get_blast_service()
        result = blast_service.run_blast(
            sequence=sequence,
            program=program,
            database=database,
            evalue=evalue,
            max_hits=max_hits,
            sequence_id=sequence_id
        )
        
        if hasattr(result, 'hits'):
            result._all_hits = list(result.hits)
        
        return result

class PredictVariants(graphene.Mutation):
    class Arguments:
        reference_sequence = graphene.String(required=True)
        variant_sequence = graphene.String()

    Output = VariantPrediction

    def mutate(self, info, reference_sequence, variant_sequence=None):
        if not reference_sequence or len(reference_sequence.strip()) < 10:
            raise ValueError("Reference sequence too short. Minimum 10 characters required.")
        
        factory = get_service_factory()
        predictor = factory.get_variant_predictor()
        analyzer = factory.get_sequence_analyzer()
        
        result = predictor.predict_variants(reference_sequence, variant_sequence)
        
        variant_prediction = VariantPrediction()
        variant_prediction._all_variants = result.get('variants', [])
        
        variant_prediction.reference = ReferenceInfo(
            sequence=result['reference']['sequence'],
            protein=result['reference']['protein'],
            length=result['reference']['length'],
            protein_length=result['reference']['protein_length']
        )
        
        summary = result.get('summary', {})
        variant_prediction.summary = VariantSummary(
            total_variants=summary.get('total_variants', 0),
            by_severity=json.dumps(summary.get('by_severity', {})),
            by_type=json.dumps(summary.get('by_type', {})),
            average_impact=summary.get('average_impact', 0.0),
            overall_risk=summary.get('overall_risk', 'low')
        )
        
        variant_prediction.recommendations = result.get('recommendations', [])
        
        features = analyzer.extract_sequence_features(reference_sequence)
        cpg_islands = analyzer.find_cpg_islands(reference_sequence)
        repeats = analyzer.find_repeat_regions(reference_sequence)
        stability = analyzer.analyze_sequence_stability(reference_sequence)
        protein = analyzer.translate_sequence(reference_sequence)
        
        variant_prediction.sequence_analysis = SequenceAnalysis(
            stats=SequenceStats(
                length=features.get('length'),
                is_dna=features.get('is_dna'),
                a_content=features.get('a_content'),
                t_content=features.get('t_content'),
                g_content=features.get('g_content'),
                c_content=features.get('c_content'),
                gc_content=features.get('gc_content'),
                at_content=features.get('at_content'),
                protein_length=features.get('protein_length'),
                has_stop_codon=features.get('has_stop_codon'),
                hydrophobicity=features.get('hydrophobicity'),
                molecular_weight=features.get('molecular_weight'),
                isoelectric_point=features.get('isoelectric_point')
            ),
            cpg_islands=[
                CpgIsland(start=i['start'], end=i['end'], gc_content=i['gc_content'], cg_ratio=i['cg_ratio'])
                for i in cpg_islands
            ],
            repeat_regions=[
                RepeatRegion(unit=r['unit'], start=r['start'], end=r['end'], count=r['count'], length=r['length'])
                for r in repeats
            ],
            stability=json.dumps(stability),
            protein_sequence=protein
        )
        
        return variant_prediction

class ClearCache(graphene.Mutation):
    class Arguments:
        cache_type = graphene.String(default_value="all")
    
    Output = graphene.Boolean
    
    def mutate(self, info, cache_type):
        cache_manager = CacheManager()
        
        if cache_type == 'blast':
            cache_manager.blast_cache.clear()
        elif cache_type == 'fasta':
            cache_manager.fasta_cache.clear()
        else:
            cache_manager.clear_all()
        
        logger.info(f"Cleared {cache_type} cache")
        return True

class Mutation(graphene.ObjectType):
    upload_fasta = UploadFasta.Field()
    run_blast = RunBlast.Field()
    predict_variants = PredictVariants.Field()
    clear_cache = ClearCache.Field()

schema = graphene.Schema(query=Query, mutation=Mutation)
