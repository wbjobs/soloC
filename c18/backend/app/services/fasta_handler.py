import os
import logging
from flask import current_app
from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from ..models import Sequence as SequenceModel
import graphene

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_SEQUENCES_PER_FILE = 1000
MAX_FILE_SIZE = 16 * 1024 * 1024

class FastaHandler:
    def __init__(self):
        self.upload_folder = current_app.config['UPLOAD_FOLDER'] if current_app else 'uploads'
        os.makedirs(self.upload_folder, exist_ok=True)
        self.max_sequences = MAX_SEQUENCES_PER_FILE

    def upload_and_parse(self, file):
        try:
            filename = file.filename
            
            if not self._allowed_file(filename):
                allowed = ', '.join(current_app.config.get('ALLOWED_EXTENSIONS', ['fa', 'fasta', 'fas']))
                logger.warning(f"Invalid file type: {filename}")
                return self._create_result(
                    success=False,
                    message=f"File type not allowed. Allowed extensions: {allowed}"
                )

            file_path = os.path.join(self.upload_folder, filename)
            
            if hasattr(file, 'content_length') and file.content_length > MAX_FILE_SIZE:
                logger.warning(f"File too large: {file.content_length} bytes")
                return self._create_result(
                    success=False,
                    message=f"File too large. Maximum {MAX_FILE_SIZE / 1024 / 1024}MB allowed"
                )

            file.save(file_path)
            
            file_size = os.path.getsize(file_path)
            if file_size > MAX_FILE_SIZE:
                os.remove(file_path)
                return self._create_result(
                    success=False,
                    message=f"File too large. Maximum {MAX_FILE_SIZE / 1024 / 1024}MB allowed"
                )

            logger.info(f"Processing file: {filename} ({file_size} bytes)")
            sequences = self._parse_fasta(file_path)
            
            result = self._create_result(
                success=True,
                message=f"Successfully parsed {len(sequences)} sequences",
                sequences=sequences,
                file_path=file_path,
                count=len(sequences)
            )
            
            logger.info(f"Parsed {len(sequences)} sequences from {filename}")
            return result
            
        except Exception as e:
            logger.error(f"Error processing file: {str(e)}", exc_info=True)
            return self._create_result(
                success=False,
                message=f"Error processing file: {str(e)}"
            )

    def parse_fasta_file(self, file_path):
        try:
            if not file_path or not os.path.exists(file_path):
                return self._create_result(
                    success=False,
                    message=f"File not found: {file_path}"
                )

            file_size = os.path.getsize(file_path)
            if file_size > MAX_FILE_SIZE:
                return self._create_result(
                    success=False,
                    message=f"File too large. Maximum {MAX_FILE_SIZE / 1024 / 1024}MB allowed"
                )

            logger.info(f"Parsing existing file: {file_path}")
            sequences = self._parse_fasta(file_path)
            
            return self._create_result(
                success=True,
                message=f"Successfully parsed {len(sequences)} sequences",
                sequences=sequences,
                file_path=file_path,
                count=len(sequences)
            )
            
        except Exception as e:
            logger.error(f"Error parsing file: {str(e)}", exc_info=True)
            return self._create_result(
                success=False,
                message=f"Error parsing file: {str(e)}"
            )

    def _parse_fasta(self, file_path):
        sequences = []
        
        with open(file_path, 'r') as handle:
            for i, record in enumerate(SeqIO.parse(handle, 'fasta')):
                if i >= self.max_sequences:
                    logger.warning(f"Max sequences ({self.max_sequences}) reached, truncating")
                    break
                
                sequence_str = str(record.seq).strip()
                seq_length = len(sequence_str)
                
                if seq_length < 10:
                    logger.warning(f"Skipping short sequence: {record.id} ({seq_length} chars)")
                    continue
                
                if seq_length > 100000:
                    logger.warning(f"Skipping long sequence: {record.id} ({seq_length} chars)")
                    continue
                
                seq_data = SequenceModel(
                    id=str(record.id),
                    name=str(record.name),
                    description=str(record.description),
                    sequence=sequence_str,
                    length=seq_length
                )
                sequences.append(seq_data)
        
        return sequences

    def _to_graphene_sequences(self, sequences):
        from ..schema import Sequence as GrapheneSequence
        return [
            GrapheneSequence(
                id=seq.id,
                name=seq.name,
                description=seq.description,
                sequence=seq.sequence,
                length=seq.length
            )
            for seq in sequences
        ]

    def _allowed_file(self, filename):
        allowed_extensions = current_app.config.get('ALLOWED_EXTENSIONS', {'fa', 'fasta', 'fas'}) \
            if current_app else {'fa', 'fasta', 'fas'}
        
        return '.' in filename and \
               filename.rsplit('.', 1)[1].lower() in allowed_extensions

    def _create_result(self, success, message, sequences=None, file_path=None, count=0):
        from ..schema import FastaUploadResult as GrapheneResult
        from ..schema import Sequence as GrapheneSequence
        
        graphene_sequences = []
        if sequences:
            graphene_sequences = [
                GrapheneSequence(
                    id=seq.id,
                    name=seq.name,
                    description=seq.description,
                    sequence=seq.sequence,
                    length=seq.length
                )
                for seq in sequences
            ]
        
        return GrapheneResult(
            success=success,
            message=message,
            sequences=graphene_sequences,
            file_path=file_path,
            count=count
        )

    def save_sequence_to_fasta(self, sequence_id, sequence, output_dir=None):
        if output_dir is None:
            output_dir = self.upload_folder
        
        os.makedirs(output_dir, exist_ok=True)
        file_path = os.path.join(output_dir, f"{sequence_id}.fasta")
        
        seq_record = SeqRecord(
            Seq(sequence),
            id=sequence_id,
            description="Query sequence for BLAST"
        )
        
        SeqIO.write(seq_record, file_path, 'fasta')
        logger.info(f"Saved sequence to: {file_path}")
        return file_path
