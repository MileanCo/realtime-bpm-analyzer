import {findPeaksAtThreshold, computeBpm} from './analyzer';
import type {RealTimeBpmAnalyzerOptions, RealTimeBpmAnalyzerParameters, ValidPeaks, NextIndexPeaks, BpmCandidates, Threshold} from './types';
import {generateValidPeaksModel, generateNextIndexPeaksModel, descendingOverThresholds} from './utils';

/**
 * Initial value of key parameters of the analyzer
 */
const initialValue = {
  minValidThreshold: () => 0.3,
  timeoutStabilization: () => 'off',
  validPeaks: () => generateValidPeaksModel(),
  nextIndexPeaks: () => generateNextIndexPeaksModel(),
  chunkCoeff: () => 1,
};

export class RealTimeBpmAnalyzer {
  options: RealTimeBpmAnalyzerOptions;
  /**
   * Minimum valid threshold, below this level result would be irrelevant.
   */
  minValidThreshold: Threshold = initialValue.minValidThreshold();
  /**
   * Schedule timeout triggered when the stabilizationTime is reached
   */
  timeoutStabilization: string | NodeJS.Timeout = initialValue.timeoutStabilization();
  /**
   * Contain all valid peaks
   */
  validPeaks: ValidPeaks = initialValue.validPeaks();
  /**
   * Next index (+10000 ...) to take care about peaks
   */
  nextIndexPeaks: NextIndexPeaks = initialValue.nextIndexPeaks();
  /**
   * Number / Position of chunks
   */
  chunkCoeff: number = initialValue.chunkCoeff();

  /**
   * @constructor
   * @param {object} config Configuration
   * @param {boolean} config.continuousAnalysis Flag indicating if we need to analyze continuously, typically used for streams
   * @param {number} config.computeBpmDelay Arbitrary delay to compute the BPM for the first time
   * @param {number} config.stabilizationTime Arbitrary time where we consider that a BPM is computable
   */
  constructor(config: RealTimeBpmAnalyzerParameters = {}) {
    /**
     * Default configuration
     * @property {object} options Default configuration
     */
    this.options = {
      continuousAnalysis: false,
      computeBpmDelay: 10000,
      stabilizationTime: 20000,
    };

    /**
     * Overriding default configuration
     */
    Object.assign(this.options, config);
  }

  setAsyncConfiguration(key: string, value: unknown): void {
    if (typeof this.options[key] === 'undefined') {
      console.log('Key not found in options', key);
      return;
    }

    this.options[key] = value;
  }

  /**
   * Reset BPM computation properties to get a fresh start
   */
  reset(): void {
    this.minValidThreshold = initialValue.minValidThreshold();
    this.timeoutStabilization = initialValue.timeoutStabilization();
    this.validPeaks = initialValue.validPeaks();
    this.nextIndexPeaks = initialValue.nextIndexPeaks();
    this.chunkCoeff = initialValue.chunkCoeff();
  }

  /**
   * Remve all validPeaks between the minThreshold pass in param to optimize the weight of datas
   * @param {number} minThreshold Value between 0.9 and 0.3
   */
  clearValidPeaks(minThreshold: Threshold): void {
    console.log(`[clearValidPeaks] function: under ${minThreshold}, this.minValidThreshold has been setted to that threshold.`);
    this.minValidThreshold = Number.parseFloat(minThreshold.toFixed(2));

    descendingOverThresholds(async threshold => {
      if (threshold < minThreshold) {
        delete this.validPeaks[threshold]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
        delete this.nextIndexPeaks[threshold]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
      }

      return false;
    }).catch((error: unknown) => {
      console.error(error);
    });
  }

  /**
   * Attach this function to an audioprocess event on a audio/video node to compute BPM / Tempo in realtime
   * @todo This function is a chimeria, it must be sliced out
   * @param {object} event Event
   */
  async analyzeChunck(channelData: Float32Array, audioSampleRate: number, bufferSize: number, postMessage: (data: any) => void): Promise<void> {
    /**
     * Compute the maximum index with all previous chunks
     * @type {number}
     */
    const currentMaxIndex = bufferSize * this.chunkCoeff;

    /**
     * Compute the minimum index with all previous chunks
     * @type {number}
     */
    const currentMinIndex = currentMaxIndex - bufferSize;

    /**
     * Mutate nextIndexPeaks and validPeaks if possible
     */
    this.findPeaks(channelData, bufferSize, currentMinIndex, currentMaxIndex);

    /**
     * Increment chunk
     */
    this.chunkCoeff++;

    const result: BpmCandidates = await computeBpm(this.validPeaks, audioSampleRate);
    const {threshold} = result;
    postMessage({message: 'BPM', result});

    if (this.minValidThreshold < threshold) {
      postMessage({message: 'BPM_STABLE', result});
      this.clearValidPeaks(threshold);
    }

    /**
     * After x milliseconds, we reinit the analyzer
     */
    if (this.options.continuousAnalysis) {
      clearTimeout(this.timeoutStabilization);
      this.timeoutStabilization = setTimeout(() => {
        console.log('[timeoutStabilization] setTimeout: Fired !');
        this.options.computeBpmDelay = 0;
        this.reset();
      }, this.options.stabilizationTime);
    }
  }

  /**
   * Find peaks at all threshold
   * Works on this.nextIndexPeaks and this.validPeaks
   * @param channelData
   * @param bufferSize
   * @param currentMinIndex
   * @param currentMaxIndex
   */
  findPeaks(channelData: Float32Array, bufferSize: number, currentMinIndex: number, currentMaxIndex: number): void {
    descendingOverThresholds(async threshold => {
      if (this.nextIndexPeaks[threshold] >= currentMaxIndex) {
        return false;
      }

      /**
       * Get the next index in the next chunk
       */
      const offsetForNextPeak = this.nextIndexPeaks[threshold] % bufferSize; // 0 - 4095

      const {peaks, threshold: atThreshold} = findPeaksAtThreshold(channelData, threshold, offsetForNextPeak);

      /**
       * Loop over peaks
       */
      if (peaks.length === 0) {
        return false;
      }

      for (const relativeChunkPeak of peaks) {
        if (typeof relativeChunkPeak === 'undefined') {
          continue;
        }

        /**
         * Add current Index + 10K
         */
        this.nextIndexPeaks[atThreshold] = currentMinIndex + relativeChunkPeak + 10000;

        /**
         * Store valid relativeChunkPeak Indexes
         */
        this.validPeaks[atThreshold].push(currentMinIndex + relativeChunkPeak);
      }

      return false;
    },
    this.minValidThreshold).catch((error: unknown) => {
      console.error(error);
    });
  }
}
