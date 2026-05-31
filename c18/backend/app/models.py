class Sequence:
    def __init__(self, id, name, description, sequence, length):
        self.id = id
        self.name = name
        self.description = description
        self.sequence = sequence
        self.length = length

class BlastHit:
    def __init__(self, query_id, subject_id, identity, alignment_length, mismatches,
                 gap_opens, q_start, q_end, s_start, s_end, evalue, bit_score, subject_title):
        self.query_id = query_id
        self.subject_id = subject_id
        self.identity = identity
        self.alignment_length = alignment_length
        self.mismatches = mismatches
        self.gap_opens = gap_opens
        self.q_start = q_start
        self.q_end = q_end
        self.s_start = s_start
        self.s_end = s_end
        self.evalue = evalue
        self.bit_score = bit_score
        self.subject_title = subject_title

class BlastResult:
    def __init__(self, query_sequence, hits, total_hits, execution_time):
        self.query_sequence = query_sequence
        self.hits = hits
        self.total_hits = total_hits
        self.execution_time = execution_time

class FastaUploadResult:
    def __init__(self, success, message, sequences, file_path, count):
        self.success = success
        self.message = message
        self.sequences = sequences
        self.file_path = file_path
        self.count = count
