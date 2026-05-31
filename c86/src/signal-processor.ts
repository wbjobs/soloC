import { Candidate, TimeSeries } from './protobuf';
import { config } from './config';
import { pulsarDatabase, MatchResult } from './pulsar-db';

export interface RFIInfo {
  frequencyHz: number;
  binIndex: number;
  magnitude: number;
  threshold: number;
  flagged: boolean;
}

export interface FoldProfileResult {
  profile: number[];
  asciiPlot: string;
  phase: number[];
  normalizedProfile: number[];
}

export interface CandidateWithProfile extends Candidate {
  profile: number[];
  normalizedProfile: number[];
  asciiPlot: string;
  matches: MatchResult[];
  bestMatch: MatchResult | null;
}

export interface ProcessingResultWithRFI {
  candidates: CandidateWithProfile[];
  initialSnr: number;
  finalSnr: number;
  denoisedData: number[];
  rfiRemoved: boolean;
  rfiCount: number;
  rfiInfo: RFIInfo[];
  cleanedData: number[];
}

export class SignalProcessor {
  private fftWindowSize: number;
  private prestoNumPeriods: number;
  private minSnrThreshold: number;
  private rfiThresholdSigma: number;
  private rfiMedianKernelSize: number;

  constructor() {
    this.fftWindowSize = config.processing.fftWindowSize;
    this.prestoNumPeriods = config.processing.prestoNumPeriods;
    this.minSnrThreshold = config.processing.minSnrThreshold;
    this.rfiThresholdSigma = 5.0;
    this.rfiMedianKernelSize = 11;
  }

  private medianFilter(data: number[], kernelSize: number): number[] {
    const n = data.length;
    const result = new Array(n);
    const halfKernel = Math.floor(kernelSize / 2);
    
    for (let i = 0; i < n; i++) {
      const window: number[] = [];
      for (let j = -halfKernel; j <= halfKernel; j++) {
        const idx = Math.max(0, Math.min(n - 1, i + j));
        window.push(data[idx]);
      }
      window.sort((a, b) => a - b);
      result[i] = window[Math.floor(window.length / 2)];
    }
    
    return result;
  }

  removeRFI(data: number[], samplingRate: number): {
    cleanedData: number[];
    rfiInfo: RFIInfo[];
    rfiCount: number;
  } {
    const n = data.length;
    const fftResult = this.fft(data);
    
    const magnitude = fftResult.map((c) => Math.sqrt(c.re * c.re + c.im * c.im));
    
    const logMagnitude = magnitude.map(m => Math.log10(m + 1e-10));
    
    const medianSmoothed = this.medianFilter(logMagnitude, this.rfiMedianKernelSize);
    
    const residuals = logMagnitude.map((logMag, i) => logMag - medianSmoothed[i]);
    const meanResidual = residuals.reduce((a, b) => a + b, 0) / n;
    const stdResidual = Math.sqrt(
      residuals.reduce((a, b) => a + (b - meanResidual) ** 2, 0) / n
    );
    
    const rfiInfo: RFIInfo[] = [];
    const rfiMask = new Array(n).fill(false);
    
    const threshold = meanResidual + this.rfiThresholdSigma * stdResidual;
    
    for (let i = 0; i < n; i++) {
      const frequencyHz = (i / n) * samplingRate;
      const isRFI = residuals[i] > threshold;
      
      rfiInfo.push({
        frequencyHz,
        binIndex: i,
        magnitude: magnitude[i],
        threshold: Math.pow(10, medianSmoothed[i] + threshold),
        flagged: isRFI,
      });
      
      if (isRFI) {
        rfiMask[i] = true;
        if (i > 0) rfiMask[i - 1] = true;
        if (i < n - 1) rfiMask[i + 1] = true;
      }
    }
    
    for (let i = 0; i < n; i++) {
      if (rfiMask[i]) {
        fftResult[i] = { re: 0, im: 0 };
      }
    }
    
    const cleanedData = this.ifft(fftResult);
    const rfiCount = rfiInfo.filter(r => r.flagged).length;
    
    return { cleanedData, rfiInfo, rfiCount };
  }

  fftDenoise(data: number[]): number[] {
    const n = data.length;
    const fftResult = this.fft(data);
    
    const magnitude = fftResult.map((c) => Math.sqrt(c.re * c.re + c.im * c.im));
    const meanMag = magnitude.reduce((a, b) => a + b, 0) / n;
    const stdMag = Math.sqrt(
      magnitude.reduce((a, b) => a + (b - meanMag) ** 2, 0) / n
    );
    
    const threshold = meanMag + 2 * stdMag;
    
    for (let i = 0; i < n; i++) {
      if (magnitude[i] < threshold) {
        fftResult[i] = { re: 0, im: 0 };
      }
    }
    
    return this.ifft(fftResult);
  }

  private fft(data: number[]): Complex[] {
    const n = data.length;
    if (n <= 1) return [{ re: data[0] || 0, im: 0 }];
    
    const even: number[] = [];
    const odd: number[] = [];
    for (let i = 0; i < n; i += 2) {
      even.push(data[i]);
      odd.push(data[i + 1] || 0);
    }
    
    const fftEven = this.fft(even);
    const fftOdd = this.fft(odd);
    
    const result: Complex[] = new Array(n);
    for (let k = 0; k < n / 2; k++) {
      const t = this.expComplex(-2 * Math.PI * k / n);
      const term = this.multiplyComplex(fftOdd[k], t);
      result[k] = this.addComplex(fftEven[k], term);
      result[k + n / 2] = this.subtractComplex(fftEven[k], term);
    }
    
    return result;
  }

  private ifft(fftResult: Complex[]): number[] {
    const n = fftResult.length;
    
    const conjugated = fftResult.map(c => ({ re: c.re, im: -c.im }));
    
    const ifftResult = this.fftComplex(conjugated);
    
    return ifftResult.map(c => c.re / n);
  }

  private fftComplex(data: Complex[]): Complex[] {
    const n = data.length;
    if (n <= 1) return [data[0] || { re: 0, im: 0 }];
    
    const even: Complex[] = [];
    const odd: Complex[] = [];
    for (let i = 0; i < n; i += 2) {
      even.push(data[i]);
      odd.push(data[i + 1] || { re: 0, im: 0 });
    }
    
    const fftEven = this.fftComplex(even);
    const fftOdd = this.fftComplex(odd);
    
    const result: Complex[] = new Array(n);
    for (let k = 0; k < n / 2; k++) {
      const t = this.expComplex(-2 * Math.PI * k / n);
      const term = this.multiplyComplex(fftOdd[k], t);
      result[k] = this.addComplex(fftEven[k], term);
      result[k + n / 2] = this.subtractComplex(fftEven[k], term);
    }
    
    return result;
  }

  private expComplex(theta: number): Complex {
    return { re: Math.cos(theta), im: Math.sin(theta) };
  }

  private addComplex(a: Complex, b: Complex): Complex {
    return { re: a.re + b.re, im: a.im + b.im };
  }

  private subtractComplex(a: Complex, b: Complex): Complex {
    return { re: a.re - b.re, im: a.im - b.im };
  }

  private multiplyComplex(a: Complex, b: Complex): Complex {
    return {
      re: a.re * b.re - a.im * b.im,
      im: a.re * b.im + a.im * b.re,
    };
  }

  prestoPeriodSearch(data: number[], samplingRate: number): Candidate[] {
    const candidates: Candidate[] = [];
    const n = data.length;
    const duration = n / samplingRate;
    
    const minPeriod = 0.001;
    const maxPeriod = duration / 2;
    const numPeriods = this.prestoNumPeriods;
    
    const periodStep = (Math.log(maxPeriod) - Math.log(minPeriod)) / numPeriods;
    
    for (let i = 0; i < numPeriods; i++) {
      const period = Math.exp(Math.log(minPeriod) + i * periodStep);
      const result = this.foldAndComputeSNR(data, period, samplingRate);
      
      if (result.snr > this.minSnrThreshold) {
        candidates.push({
          period: period,
          snr: result.snr,
          dm: 0,
          significance: result.significance,
          pulseCount: result.pulseCount,
        });
      }
    }
    
    return candidates.sort((a, b) => b.snr - a.snr).slice(0, 50);
  }

  generateFoldProfile(data: number[], period: number, samplingRate: number, numBins: number = 64): FoldProfileResult {
    const n = data.length;
    const samplesPerPeriod = period * samplingRate;
    
    if (numBins < 2 || samplesPerPeriod < 1) {
      const emptyProfile = new Array(numBins).fill(0);
      return {
        profile: emptyProfile,
        asciiPlot: this.generateASCIIPlot(emptyProfile),
        phase: emptyProfile.map((_, i) => i / numBins),
        normalizedProfile: emptyProfile,
      };
    }
    
    const foldedProfile = new Array(numBins).fill(0);
    const counts = new Array(numBins).fill(0);
    
    for (let i = 0; i < n; i++) {
      const phase = (i / samplesPerPeriod) % 1;
      const bin = Math.floor(phase * numBins);
      foldedProfile[bin] += data[i];
      counts[bin]++;
    }
    
    for (let i = 0; i < numBins; i++) {
      if (counts[i] > 0) {
        foldedProfile[i] /= counts[i];
      }
    }
    
    const normalizedProfile = pulsarDatabase.normalizeProfile(foldedProfile);
    const phase = foldedProfile.map((_, i) => i / numBins);
    const asciiPlot = this.generateASCIIPlot(normalizedProfile);
    
    return {
      profile: foldedProfile,
      asciiPlot,
      phase,
      normalizedProfile,
    };
  }

  generateASCIIPlot(profile: number[], width: number = 60, height: number = 12): string {
    const n = profile.length;
    const lines: string[] = [];
    
    const max = Math.max(...profile);
    const min = Math.min(...profile);
    const range = max - min || 1;
    
    const normalized = profile.map(v => (v - min) / range);
    
    lines.push('  Pulse Profile (Normalized)');
    lines.push('  ' + '─'.repeat(width));
    
    for (let row = height - 1; row >= 0; row--) {
      const threshold = row / height;
      let line = '  │';
      
      for (let i = 0; i < width; i++) {
        const binIdx = Math.floor((i / width) * n);
        if (normalized[binIdx] >= threshold) {
          line += '█';
        } else {
          line += ' ';
        }
      }
      
      line += '│';
      if (row === height - 1) line += ' 1.00';
      else if (row === 0) line += ' 0.00';
      lines.push(line);
    }
    
    lines.push('  ' + '─'.repeat(width));
    lines.push('  Phase: ' + '0.0'.padEnd(width / 2 - 2) + '0.5'.padStart(width / 2) + '1.0');
    lines.push('');
    
    return lines.join('\n');
  }

  private padCenter(str: string, width: number): string {
    const pad = width - str.length;
    if (pad <= 0) return str.slice(0, width);
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return ' '.repeat(left) + str + ' '.repeat(right);
  }

  generateDetailedASCIIPlot(profile: number[], period: number, dm: number, snr: number): string {
    const lines: string[] = [];
    
    lines.push('╔' + '═'.repeat(70) + '╗');
    lines.push('║' + this.padCenter(' Standardized Pulse Profile ', 70) + '║');
    lines.push('╠' + '═'.repeat(70) + '╣');
    lines.push('║' + ` Period: ${period.toFixed(6)} s | DM: ${dm.toFixed(2)} | SNR: ${snr.toFixed(2)}`.padEnd(70) + '║');
    lines.push('╠' + '═'.repeat(70) + '╣');
    
    const plot = this.generateASCIIPlot(profile, 68, 10);
    lines.push(...plot.split('\n').map(line => '║' + line.padEnd(70) + '║'));
    
    lines.push('╚' + '═'.repeat(70) + '╝');
    
    return lines.join('\n');
  }

  private foldAndComputeSNR(data: number[], period: number, samplingRate: number): { snr: number; significance: number; pulseCount: number } {
    const n = data.length;
    const samplesPerPeriod = period * samplingRate;
    const numBins = Math.min(64, Math.floor(samplesPerPeriod));
    
    if (numBins < 2) {
      return { snr: 0, significance: 0, pulseCount: 0 };
    }
    
    const foldedProfile = new Array(numBins).fill(0);
    const counts = new Array(numBins).fill(0);
    
    for (let i = 0; i < n; i++) {
      const phase = (i / samplesPerPeriod) % 1;
      const bin = Math.floor(phase * numBins);
      foldedProfile[bin] += data[i];
      counts[bin]++;
    }
    
    for (let i = 0; i < numBins; i++) {
      if (counts[i] > 0) {
        foldedProfile[i] /= counts[i];
      }
    }
    
    const mean = foldedProfile.reduce((a, b) => a + b, 0) / numBins;
    const std = Math.sqrt(
      foldedProfile.reduce((a, b) => a + (b - mean) ** 2, 0) / numBins
    );
    
    if (std === 0) {
      return { snr: 0, significance: 0, pulseCount: 0 };
    }
    
    const maxValue = Math.max(...foldedProfile);
    const snr = (maxValue - mean) / std;
    
    const pulseCount = foldedProfile.filter(v => v > mean + std).length;
    const significance = snr * Math.sqrt(pulseCount || 1);
    
    return { snr, significance, pulseCount };
  }

  dmSearch(data: number[], dmMin: number, dmMax: number, samplingRate: number, startFreq: number, endFreq: number): CandidateWithProfile[] {
    const allCandidates: CandidateWithProfile[] = [];
    const numDmTrials = 20;
    const dmStep = (dmMax - dmMin) / numDmTrials;
    
    for (let i = 0; i < numDmTrials; i++) {
      const dm = dmMin + i * dmStep;
      const dedispersedData = this.dedisperse(data, dm, samplingRate, startFreq, endFreq);
      
      const candidates = this.prestoPeriodSearch(dedispersedData, samplingRate);
      
      candidates.forEach(c => {
        const foldResult = this.generateFoldProfile(dedispersedData, c.period, samplingRate, 64);
        
        const matches = pulsarDatabase.matchCandidate(
          foldResult.normalizedProfile,
          c.period,
          dm,
          {
            periodTolerance: 0.1,
            dmTolerance: 20,
            threshold: 0.85,
            useCrossCorrelation: true,
          }
        );
        
        const bestMatch = matches.length > 0 && matches[0].matched ? matches[0] : null;
        
        allCandidates.push({
          period: c.period,
          snr: c.snr,
          dm: dm,
          significance: c.significance,
          pulseCount: c.pulseCount,
          profile: foldResult.profile,
          normalizedProfile: foldResult.normalizedProfile,
          asciiPlot: this.generateDetailedASCIIPlot(foldResult.normalizedProfile, c.period, dm, c.snr),
          matches,
          bestMatch,
        });
      });
    }
    
    return allCandidates.sort((a, b) => b.snr - a.snr).slice(0, 100);
  }

  private dedisperse(data: number[], dm: number, samplingRate: number, startFreq: number, endFreq: number): number[] {
    const n = data.length;
    const result = new Array(n).fill(0);
    const numFreq = 128;
    const freqStep = (endFreq - startFreq) / numFreq;
    
    const referenceDelay = (freq: number) => {
      const k = 4.148808e3;
      return k * dm * (1 / (freq * freq)) * samplingRate;
    };
    
    for (let f = 0; f < numFreq; f++) {
      const freq = startFreq + f * freqStep;
      const delay = Math.round(referenceDelay(freq) - referenceDelay(endFreq));
      
      for (let i = 0; i < n - delay; i++) {
        result[i] += data[i + delay] / numFreq;
      }
    }
    
    return result;
  }

  calculateSNR(data: number[]): number {
    const n = data.length;
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    
    if (std === 0) return 0;
    
    const maxDeviation = Math.max(...data.map(v => Math.abs(v - mean)));
    return maxDeviation / std;
  }

  process(signalData: TimeSeries): ProcessingResultWithRFI {
    const initialSnr = this.calculateSNR(signalData.data);
    
    const rfiResult = this.removeRFI(signalData.data, signalData.samplingRate);
    
    const denoisedData = this.fftDenoise(rfiResult.cleanedData);
    
    const finalSnr = this.calculateSNR(denoisedData);
    
    const candidates = this.dmSearch(
      denoisedData,
      signalData.dmMin,
      signalData.dmMax,
      signalData.samplingRate,
      signalData.startFrequency,
      signalData.endFrequency
    );
    
    return {
      candidates,
      initialSnr,
      finalSnr,
      denoisedData,
      rfiRemoved: rfiResult.rfiCount > 0,
      rfiCount: rfiResult.rfiCount,
      rfiInfo: rfiResult.rfiInfo.filter(r => r.flagged),
      cleanedData: rfiResult.cleanedData,
    };
  }
}

interface Complex {
  re: number;
  im: number;
}
