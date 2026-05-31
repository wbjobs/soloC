export interface CigarOp {
  type: string;
  length: number;
}

export interface Mismatch {
  type: string;
  pos: number;
  ref_base?: string;
  seq?: string;
}

export interface Alignment {
  query_name: string;
  reference_name: string;
  reference_start: number;
  reference_end: number;
  mapping_quality: number;
  cigar: CigarOp[];
  query_sequence: string;
  query_qualities: number[];
  is_reverse: boolean;
  is_secondary: boolean;
  is_supplementary: boolean;
  mismatches?: Mismatch[];
}

export interface AlignmentResult {
  reference_sequences: Record<string, string>;
  alignments: Alignment[];
  total_reads: number;
}

export interface Viewport {
  start: number;
  end: number;
  zoom: number;
}
