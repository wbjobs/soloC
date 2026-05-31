import os
import time
import logging
from flask import current_app
from Bio.Blast import NCBIWWW, NCBIXML
from Bio import SeqIO
from ..models import Sequence, BlastResult, BlastHit
from ..schema import Sequence as GrapheneSequence, BlastResult as GrapheneBlastResult, BlastHit as GrapheneBlastHit
from ..utils.cache import CacheManager
from ..utils.sequence_validator import (
    validate_sequence, 
    sanitize_sequence, 
    detect_program_from_sequence,
    get_sequence_type
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

VALID_PROGRAMS = {
    'blastn': 'nucleotide',
    'blastp': 'protein',
    'blastx': 'translated',
    'tblastn': 'translated',
    'tblastx': 'translated'
}

VALID_DATABASES = {
    'blastn': ['nt', 'nr', 'refseq_rna', 'refseq_genomic', 'est', 'gss', 'wgs'],
    'blastp': ['nr', 'refseq_protein', 'swissprot', 'pdb', 'pat'],
    'blastx': ['nr', 'refseq_protein', 'swissprot', 'pdb', 'pat'],
    'tblastn': ['nt', 'nr', 'refseq_rna', 'refseq_genomic', 'est', 'gss', 'wgs'],
    'tblastx': ['nt', 'nr', 'est', 'gss', 'wgs']
}

class BlastService:
    def __init__(self):
        self.results_folder = current_app.config['BLAST_RESULTS_PATH'] if current_app else 'blast_results'
        os.makedirs(self.results_folder, exist_ok=True)
        self.cache_manager = CacheManager()
        self.max_retries = 3
        self.retry_delay = 5

    def run_blast(self, sequence, program='blastn', database='nr', evalue=10.0, max_hits=50, sequence_id='query'):
        start_time = time.time()
        
        try:
            sequence = sanitize_sequence(sequence) if sequence else ''
            
            if not sequence or len(sequence.strip()) == 0:
                return self._create_empty_result(sequence_id, "Empty sequence")

            valid, message = validate_sequence(sequence, program)
            if not valid:
                logger.warning(f"Sequence validation failed: {message}")
                return self._create_empty_result(sequence_id, f"Validation failed: {message}")

            program = self._validate_and_adjust_program(program, sequence)
            database = self._validate_database(database, program)
            
            cached_result = self.cache_manager.get_blast(
                sequence, program, database, evalue, max_hits
            )
            if cached_result:
                logger.info("Using cached BLAST result")
                return cached_result

            logger.info(f"Running BLAST {program} against {database}")
            blast_result = self._execute_blast_with_retry(
                sequence, program, database, evalue, max_hits, sequence_id
            )
            
            if blast_result:
                self.cache_manager.set_blast(
                    sequence, program, database, evalue, max_hits, blast_result
                )
            
            execution_time = time.time() - start_time
            logger.info(f"BLAST completed in {execution_time:.2f} seconds")
            
            return blast_result

        except Exception as e:
            logger.error(f"BLAST error: {str(e)}", exc_info=True)
            return self._create_empty_result(
                sequence_id, 
                f"Error: {str(e)}", 
                sequence, 
                time.time() - start_time
            )

    def _validate_and_adjust_program(self, program, sequence):
        if program not in VALID_PROGRAMS:
            detected_program = detect_program_from_sequence(sequence)
            logger.warning(f"Invalid program '{program}', using detected: {detected_program}")
            return detected_program
        return program

    def _validate_database(self, database, program):
        valid_dbs = VALID_DATABASES.get(program, ['nr'])
        if database not in valid_dbs:
            logger.warning(f"Invalid database '{database}' for {program}, using 'nr'")
            return 'nr'
        return database

    def _execute_blast_with_retry(self, sequence, program, database, evalue, max_hits, sequence_id):
        query_sequence = Sequence(
            id=sequence_id,
            name=sequence_id,
            description=f"Query sequence for {program} against {database}",
            sequence=sequence,
            length=len(sequence)
        )
        
        last_exception = None
        
        for attempt in range(self.max_retries):
            try:
                logger.info(f"BLAST attempt {attempt + 1}/{self.max_retries}")
                
                params = {
                    'program': program,
                    'database': database,
                    'sequence': sequence,
                    'expect': float(evalue),
                    'hitlist_size': int(max_hits),
                    'timeout': 120
                }
                
                result_handle = NCBIWWW.qblast(**params)
                
                if result_handle is None:
                    raise ValueError("Empty response from NCBI")
                
                blast_records = list(NCBIXML.parse(result_handle))
                result_handle.close()
                
                all_hits = []
                seen_hits = set()
                
                for blast_record in blast_records:
                    for alignment in blast_record.alignments:
                        for hsp in alignment.hsps:
                            hit_key = f"{alignment.accession}_{hsp.query_start}_{hsp.sbjct_start}"
                            
                            if hit_key in seen_hits:
                                continue
                            seen_hits.add(hit_key)
                            
                            identity_percent = self._calculate_identity(hsp)
                            
                            hit = BlastHit(
                                query_id=sequence_id,
                                subject_id=alignment.accession,
                                identity=identity_percent,
                                alignment_length=hsp.align_length,
                                mismatches=hsp.align_length - hsp.identities - hsp.gaps,
                                gap_opens=hsp.gaps,
                                q_start=hsp.query_start,
                                q_end=hsp.query_end,
                                s_start=hsp.sbjct_start,
                                s_end=hsp.sbjct_end,
                                evalue=float(hsp.expect),
                                bit_score=float(hsp.bits),
                                subject_title=alignment.title
                            )
                            all_hits.append(hit)
                
                all_hits.sort(key=lambda x: (-x.bit_score, x.evalue))
                
                return self._create_result_object(query_sequence, all_hits)
                
            except Exception as e:
                last_exception = e
                logger.warning(f"BLAST attempt {attempt + 1} failed: {str(e)}")
                
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (attempt + 1))
        
        logger.error(f"All BLAST attempts failed: {str(last_exception)}")
        return self._create_empty_result(
            sequence_id, 
            f"All {self.max_retries} attempts failed: {str(last_exception)}", 
            sequence
        )

    def _calculate_identity(self, hsp):
        if hsp.align_length == 0:
            return 0.0
        
        if hasattr(hsp, 'identities') and hasattr(hsp, 'align_length'):
            return round((hsp.identities / hsp.align_length) * 100, 2)
        
        if hasattr(hsp, 'positives'):
            return round((hsp.positives / hsp.align_length) * 100, 2)
        
        return 0.0

    def _create_empty_result(self, sequence_id, message, sequence='', execution_time=0):
        return GrapheneBlastResult(
            query_sequence=GrapheneSequence(
                id=sequence_id,
                name=sequence_id,
                description=message,
                sequence=sequence,
                length=len(sequence)
            ),
            hits=[],
            total_hits=0,
            execution_time=round(execution_time, 2)
        )

    def _create_result_object(self, query_sequence, hits):
        graphene_hits = [
            GrapheneBlastHit(
                query_id=hit.query_id,
                subject_id=hit.subject_id,
                identity=hit.identity,
                alignment_length=hit.alignment_length,
                mismatches=hit.mismatches,
                gap_opens=hit.gap_opens,
                q_start=hit.q_start,
                q_end=hit.q_end,
                s_start=hit.s_start,
                s_end=hit.s_end,
                evalue=hit.evalue,
                bit_score=hit.bit_score,
                subject_title=hit.subject_title
            )
            for hit in hits
        ]
        
        return GrapheneBlastResult(
            query_sequence=GrapheneSequence(
                id=query_sequence.id,
                name=query_sequence.name,
                description=query_sequence.description,
                sequence=query_sequence.sequence,
                length=query_sequence.length
            ),
            hits=graphene_hits,
            total_hits=len(hits),
            execution_time=0.0
        )

    def save_blast_result(self, result, filename):
        result_path = os.path.join(self.results_folder, filename)
        with open(result_path, 'w') as f:
            f.write(str(result))
        return result_path

    def create_local_blast_db(self, fasta_file, db_name):
        try:
            from Bio.Blast.Applications import NcbimakeblastdbCommandline
            db_path = os.path.join(self.results_folder, db_name)
            
            seq_type = get_sequence_type(open(fasta_file).read())
            dbtype = 'nucl' if seq_type == 'nucleotide' else 'prot'
            
            cline = NcbimakeblastdbCommandline(
                cmd="makeblastdb",
                dbtype=dbtype,
                input_file=fasta_file,
                out=db_path
            )
            stdout, stderr = cline()
            return True, stdout
        except ImportError:
            return False, "NCBI BLAST+ command line tools not available. Using NCBI remote BLAST instead."
        except Exception as e:
            logger.error(f"Local BLAST DB creation failed: {str(e)}")
            return False, str(e)
