export type Threshold = number;

/**
 * Types
 */
export type Peaks = number[];

export interface PeaksAndThreshold {
  peaks: Peaks;
  threshold: Threshold;
}

export interface BpmCandidates {
  bpm: Tempo[];
  threshold: Threshold;
}

export interface Interval {
  interval: number;
  count: number;
}

export interface Tempo {
  tempo: number;
  count: number;
}

export interface RealTimeBpmAnalyzerParameters {
  continuousAnalysis?: boolean;
  computeBpmDelay?: number;
  stabilizationTime?: number;
}

export interface RealTimeBpmAnalyzerOptions {
  continuousAnalysis: boolean;
  computeBpmDelay: number;
  stabilizationTime: number;
}

export type ValidPeaks = Record<string, Peaks>;
export type NextIndexPeaks = Record<string, number>;

export interface OnThresholdFunction {
  (threshold: Threshold): Promise<boolean>;
}
