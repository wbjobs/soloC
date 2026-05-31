import { gql } from '@apollo/client';

export const UPLOAD_FASTA = gql`
  mutation UploadFasta($file: Upload!) {
    uploadFasta(file: $file) {
      success
      message
      count
      file_path
      sequences(limit: 100, offset: 0) {
        id
        name
        description
        sequence
        length
      }
    }
  }
`;

export const RUN_BLAST = gql`
  mutation RunBlast(
    $sequenceId: String!,
    $sequence: String!,
    $program: String!,
    $database: String!,
    $evalue: Float!,
    $maxHits: Int!
  ) {
    runBlast(
      sequence_id: $sequenceId,
      sequence: $sequence,
      program: $program,
      database: $database,
      evalue: $evalue,
      max_hits: $maxHits
    ) {
      query_sequence {
        id
        name
        description
        length
      }
      hits(limit: 100, offset: 0) {
        query_id
        subject_id
        identity
        alignment_length
        mismatches
        gap_opens
        q_start
        q_end
        s_start
        s_end
        evalue
        bit_score
        subject_title
      }
      total_hits
      execution_time
    }
  }
`;

export const PREDICT_VARIANTS = gql`
  mutation PredictVariants($referenceSequence: String!, $variantSequence: String) {
    predictVariants(reference_sequence: $referenceSequence, variant_sequence: $variantSequence) {
      reference {
        sequence
        protein
        length
        protein_length
      }
      variants(limit: 100, offset: 0) {
        type
        position
        ref_nucleotide
        var_nucleotide
        ref_amino_acid
        var_amino_acid
        codon_position
        ref_codon
        var_codon
        effect {
          description
          severity
        }
        impact_score
        severity
        probability
        clinical_significance
        blosum62_score
        conservation_type
        indel_length
        indel_type
        glutamine_count
        risk_category
        splice_type
        context_sequence
        gc_content
      }
      summary {
        total_variants
        by_severity
        by_type
        average_impact
        overall_risk
      }
      recommendations
      sequence_analysis {
        stats {
          length
          is_dna
          a_content
          t_content
          g_content
          c_content
          gc_content
          at_content
          protein_length
          has_stop_codon
          hydrophobicity
          molecular_weight
          isoelectric_point
        }
        cpg_islands {
          start
          end
          gc_content
          cg_ratio
        }
        repeat_regions {
          unit
          start
          end
          count
          length
        }
        stability
        protein_sequence
      }
    }
  }
`;

export const ANALYZE_SEQUENCE_FEATURES = gql`
  query AnalyzeSequenceFeatures($sequence: String!) {
    analyzeSequenceFeatures(sequence: $sequence) {
      stats {
        length
        is_dna
        a_content
        t_content
        g_content
        c_content
        gc_content
        at_content
        protein_length
        has_stop_codon
        hydrophobicity
        molecular_weight
        isoelectric_point
      }
      cpg_islands {
        start
        end
        gc_content
        cg_ratio
      }
      repeat_regions {
        unit
        start
        end
        count
        length
      }
      stability
      protein_sequence
    }
  }
`;

export const GET_BLAST_HITS_WITH_FILTERS = gql`
  query GetBlastHits(
    $sequence: String!,
    $program: String!,
    $database: String!,
    $evalue: Float!,
    $maxHits: Int!,
    $limit: Int!,
    $offset: Int!,
    $minIdentity: Float!,
    $maxEvalue: Float!
  ) {
    analyzeSequence(
      sequence: $sequence,
      program: $program,
      database: $database,
      evalue: $evalue,
      max_hits: $maxHits
    ) {
      query_sequence {
        id
        name
        length
      }
      hits(
        limit: $limit,
        offset: $offset,
        min_identity: $minIdentity,
        max_evalue: $maxEvalue
      ) {
        subject_id
        identity
        evalue
        bit_score
        subject_title
      }
      total_hits
      execution_time
    }
  }
`;

export const PARSE_FASTA = gql`
  query ParseFasta($filePath: String!, $limit: Int!, $offset: Int!) {
    parseFasta(file_path: $filePath) {
      success
      message
      count
      sequences(limit: $limit, offset: $offset) {
        id
        name
        description
        length
      }
    }
  }
`;

export const HELLO = gql`
  query Hello($name: String) {
    hello(name: $name)
  }
`;

export const GET_CACHED_QUERIES = gql`
  query GetCachedQueries {
    cachedQueries
  }
`;

export const CLEAR_CACHE = gql`
  mutation ClearCache($cacheType: String!) {
    clearCache(cache_type: $cacheType)
  }
`;
