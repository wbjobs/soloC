export interface PulsarProfile {
  name: string;
  period: number;
  dm: number;
  snr: number;
  profile: number[];
  ra: string;
  dec: string;
  type: string;
}

export interface MatchResult {
  pulsar: PulsarProfile;
  similarity: number;
  matched: boolean;
  threshold: number;
}

class PulsarDatabase {
  private pulsars: PulsarProfile[] = [];
  private similarityThreshold: number = 0.85;

  constructor() {
    this.initializePulsars();
  }

  private initializePulsars(): void {
    this.pulsars = [
      {
        name: 'J0437-4715',
        period: 0.005757,
        dm: 2.65,
        snr: 150.0,
        profile: this.generateGaussianProfile(64, 0.1, 0.02),
        ra: '04:37:15.9',
        dec: '-47:15:09',
        type: 'MSP'
      },
      {
        name: 'J0534+2200',
        period: 0.033392,
        dm: 56.8,
        snr: 200.0,
        profile: this.generateCrabLikeProfile(64),
        ra: '05:34:31.9',
        dec: '+22:00:52',
        type: '年轻脉冲星'
      },
      {
        name: 'J0835-4510',
        period: 0.089325,
        dm: 67.8,
        snr: 120.0,
        profile: this.generateDoublePeakProfile(64),
        ra: '08:35:20.6',
        dec: '-45:10:44',
        type: 'Vela类'
      },
      {
        name: 'J1939+2134',
        period: 0.001558,
        dm: 71.0,
        snr: 80.0,
        profile: this.generateGaussianProfile(64, 0.3, 0.015),
        ra: '19:39:38.6',
        dec: '+21:34:59',
        type: 'MSP'
      },
      {
        name: 'J2144-3933',
        period: 0.002885,
        dm: 3.4,
        snr: 95.0,
        profile: this.generateGaussianProfile(64, 0.7, 0.025),
        ra: '21:44:11.4',
        dec: '-39:33:52',
        type: 'MSP'
      },
      {
        name: 'J1713+0747',
        period: 0.00457,
        dm: 15.99,
        snr: 110.0,
        profile: this.generateTriplePeakProfile(64),
        ra: '17:13:49.5',
        dec: '+07:47:37',
        type: 'Binary MSP'
      },
      {
        name: 'J1857+0943',
        period: 0.00536,
        dm: 13.1,
        snr: 85.0,
        profile: this.generateDoublePeakProfile(64),
        ra: '18:57:36.8',
        dec: '+09:43:17',
        type: 'MSP'
      },
      {
        name: 'J0030+0451',
        period: 0.00487,
        dm: 4.35,
        snr: 75.0,
        profile: this.generateGaussianProfile(64, 0.5, 0.018),
        ra: '00:30:27.4',
        dec: '+04:51:39',
        type: 'MSP'
      },
      {
        name: 'J1643-1224',
        period: 0.00462,
        dm: 62.4,
        snr: 90.0,
        profile: this.generateCrabLikeProfile(64),
        ra: '16:43:38.2',
        dec: '-12:24:59',
        type: '年轻脉冲星'
      },
      {
        name: 'J1903+0327',
        period: 0.00215,
        dm: 297.4,
        snr: 65.0,
        profile: this.generateGaussianProfile(64, 0.2, 0.012),
        ra: '19:03:40.9',
        dec: '+03:27:13',
        type: '高DM脉冲星'
      }
    ];
  }

  private generateGaussianProfile(n: number, center: number, sigma: number): number[] {
    const profile = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const x = i / n;
      profile[i] = Math.exp(-0.5 * Math.pow((x - center) / sigma, 2));
    }
    return this.normalizeProfile(profile);
  }

  private generateCrabLikeProfile(n: number): number[] {
    const profile = new Array(n).fill(0);
    const mainPeak = 0.4;
    const interPulse = 0.9;
    const sigma = 0.03;
    
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const peak1 = Math.exp(-0.5 * Math.pow((x - mainPeak) / sigma, 2));
      const peak2 = 0.4 * Math.exp(-0.5 * Math.pow((x - interPulse) / sigma, 2));
      profile[i] = peak1 + peak2;
    }
    return this.normalizeProfile(profile);
  }

  private generateDoublePeakProfile(n: number): number[] {
    const profile = new Array(n).fill(0);
    const peak1 = 0.35;
    const peak2 = 0.65;
    const sigma = 0.04;
    
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const p1 = Math.exp(-0.5 * Math.pow((x - peak1) / sigma, 2));
      const p2 = 0.85 * Math.exp(-0.5 * Math.pow((x - peak2) / sigma, 2));
      profile[i] = p1 + p2;
    }
    return this.normalizeProfile(profile);
  }

  private generateTriplePeakProfile(n: number): number[] {
    const profile = new Array(n).fill(0);
    const peak1 = 0.2;
    const peak2 = 0.5;
    const peak3 = 0.8;
    const sigma = 0.025;
    
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const p1 = Math.exp(-0.5 * Math.pow((x - peak1) / sigma, 2));
      const p2 = 0.9 * Math.exp(-0.5 * Math.pow((x - peak2) / sigma, 2));
      const p3 = 0.7 * Math.exp(-0.5 * Math.pow((x - peak3) / sigma, 2));
      profile[i] = p1 + p2 + p3;
    }
    return this.normalizeProfile(profile);
  }

  normalizeProfile(profile: number[]): number[] {
    const max = Math.max(...profile);
    const min = Math.min(...profile);
    const range = max - min;
    
    if (range === 0) {
      return profile.map(() => 0);
    }
    
    return profile.map(v => (v - min) / range);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      const minLen = Math.min(a.length, b.length);
      a = a.slice(0, minLen);
      b = b.slice(0, minLen);
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  crossCorrelationSimilarity(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    let maxSimilarity = 0;
    
    for (let shift = 0; shift < n; shift++) {
      let similarity = 0;
      for (let i = 0; i < n; i++) {
        similarity += a[i] * b[(i + shift) % n];
      }
      similarity /= n;
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
    }
    
    return maxSimilarity;
  }

  matchCandidate(
    candidateProfile: number[],
    candidatePeriod: number,
    candidateDM: number,
    options: {
      periodTolerance?: number;
      dmTolerance?: number;
      threshold?: number;
      useCrossCorrelation?: boolean;
    } = {}
  ): MatchResult[] {
    const {
      periodTolerance = 0.1,
      dmTolerance = 20,
      threshold = this.similarityThreshold,
      useCrossCorrelation = true,
    } = options;

    const normalizedCandidate = this.normalizeProfile(candidateProfile);

    const results: MatchResult[] = [];

    for (const pulsar of this.pulsars) {
      const periodRatio = Math.abs(candidatePeriod - pulsar.period) / pulsar.period;
      const dmDiff = Math.abs(candidateDM - pulsar.dm);

      if (periodRatio > periodTolerance || dmDiff > dmTolerance) {
        continue;
      }

      let similarity: number;
      if (useCrossCorrelation) {
        similarity = this.crossCorrelationSimilarity(normalizedCandidate, pulsar.profile);
      } else {
        similarity = this.cosineSimilarity(normalizedCandidate, pulsar.profile);
      }

      results.push({
        pulsar,
        similarity,
        matched: similarity >= threshold,
        threshold,
      });
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  getAllPulsars(): PulsarProfile[] {
    return [...this.pulsars];
  }

  getPulsarByName(name: string): PulsarProfile | undefined {
    return this.pulsars.find(p => p.name === name);
  }

  searchPulsars(
    criteria: {
      minPeriod?: number;
      maxPeriod?: number;
      minDM?: number;
      maxDM?: number;
      type?: string;
    } = {}
  ): PulsarProfile[] {
    return this.pulsars.filter(p => {
      if (criteria.minPeriod !== undefined && p.period < criteria.minPeriod) return false;
      if (criteria.maxPeriod !== undefined && p.period > criteria.maxPeriodPeriod) return false;
      if (criteria.minDM !== undefined && p.dm < criteria.minDM) return false;
      if (criteria.maxDM !== undefined && p.dm > criteria.maxDM) return false;
      if (criteria.type !== undefined && p.type !== criteria.type) return false;
      return true;
    });
  }

  getSimilarityThreshold(): number {
    return this.similarityThreshold;
  }

  setSimilarityThreshold(threshold: number): void {
    this.similarityThreshold = Math.max(0, Math.min(1, threshold));
  }
}

export const pulsarDatabase = new PulsarDatabase();
