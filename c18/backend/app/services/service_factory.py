from .fasta_handler import FastaHandler
from .blast_service import BlastService
from .variant_predictor import VariantPredictor
from app.utils.sequence_analyzer import SequenceAnalyzer


class ServiceFactory:
    _fasta_handler = None
    _blast_service = None
    _variant_predictor = None
    _sequence_analyzer = None
    
    @classmethod
    def get_fasta_handler(cls):
        if cls._fasta_handler is None:
            cls._fasta_handler = FastaHandler()
        return cls._fasta_handler
    
    @classmethod
    def get_blast_service(cls):
        if cls._blast_service is None:
            cls._blast_service = BlastService()
        return cls._blast_service
    
    @classmethod
    def get_variant_predictor(cls):
        if cls._variant_predictor is None:
            cls._variant_predictor = VariantPredictor()
        return cls._variant_predictor
    
    @classmethod
    def get_sequence_analyzer(cls):
        if cls._sequence_analyzer is None:
            cls._sequence_analyzer = SequenceAnalyzer()
        return cls._sequence_analyzer
    
    @classmethod
    def reset(cls):
        cls._fasta_handler = None
        cls._blast_service = None
        cls._variant_predictor = None
        cls._sequence_analyzer = None
