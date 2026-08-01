/**
 * MinerService — Manages real SHA-256 proof-of-work mining via Web Worker.
 *
 * Features:
 * - Creates/terminates a Web Worker for background mining
 * - Auto-adjusts difficulty based on block-find time
 * - Persists mined blocks and stats to localStorage
 * - 50 IGNS reward per block (Bitcoin-style)
 */

export interface MinedBlock {
  blockNumber: number;
  nonce: number;
  hash: string;
  timestamp: number;
  reward: number;
}

export interface MiningStats {
  blocksMined: number;
  totalRewards: number;
  currentHashRate: number;
  difficulty: number;
  isMining: boolean;
}

const STORAGE_KEYS = {
  BLOCKS: "ignosha_mined_blocks",
  DIFFICULTY: "ignosha_mining_difficulty",
  BLOCK_NUMBER: "ignosha_next_block_number",
  TOTAL_REWARDS: "ignosha_total_rewards",
  HASH_RATE_HISTORY: "ignosha_hash_rate_history",
} as const;

export const REWARD_PER_BLOCK = 50; // IGNS per block
const DEFAULT_DIFFICULTY = 3;
const TARGET_BLOCK_TIME_MS = 15000; // 15 seconds target
const DIFFICULTY_ADJUST_WINDOW = 3; // adjust after this many blocks

type BlockCallback = (block: MinedBlock) => void;
type HashRateCallback = (rate: number) => void;
type StatusCallback = (mining: boolean) => void;

class MinerService {
  private worker: Worker | null = null;
  private _isMining = false;
  private _difficulty: number;
  private _blockNumber: number;
  private _totalRewards: number;
  private _currentHashRate = 0;
  private _hashRateHistory: number[] = [];

  private onBlockFound: BlockCallback | null = null;
  private onHashRate: HashRateCallback | null = null;
  private onStatusChange: StatusCallback | null = null;

  // For difficulty adjustment
  private recentBlockTimes: number[] = [];
  private lastBlockStartTime: number = 0;

  constructor() {
    this._difficulty = this.loadDifficulty();
    this._blockNumber = this.loadBlockNumber();
    this._totalRewards = this.loadTotalRewards();
    this._hashRateHistory = this.loadHashRateHistory();
  }

  // ─── Public getters ──────────────────────

  get isMining(): boolean {
    return this._isMining;
  }

  get difficulty(): number {
    return this._difficulty;
  }

  get blockNumber(): number {
    return this._blockNumber;
  }

  get totalRewards(): number {
    return this._totalRewards;
  }

  get currentHashRate(): number {
    return this._currentHashRate;
  }

  get hashRateHistory(): number[] {
    return this._hashRateHistory;
  }

  get minedBlocks(): MinedBlock[] {
    return this.loadBlocks();
  }

  getStats(): MiningStats {
    return {
      blocksMined: this._blockNumber - 1,
      totalRewards: this._totalRewards,
      currentHashRate: this._currentHashRate,
      difficulty: this._difficulty,
      isMining: this._isMining,
    };
  }

  // ─── Callback registration ───────────────

  setOnBlockFound(cb: BlockCallback | null): void {
    this.onBlockFound = cb;
  }

  setOnHashRate(cb: HashRateCallback | null): void {
    this.onHashRate = cb;
  }

  setOnStatusChange(cb: StatusCallback | null): void {
    this.onStatusChange = cb;
  }

  // ─── Mining control ──────────────────────

  /**
   * Start the mining worker. Creates a new worker if needed.
   */
  startMining(): void {
    if (this._isMining) return;

    // Create worker if not already created
    if (!this.worker) {
      this.worker = new Worker("/miner-worker.js");
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = (err) => {
        console.error("[MinerService] Worker error:", err);
        this.stopMining();
      };
    }

    this._isMining = true;
    this.lastBlockStartTime = Date.now();
    this._currentHashRate = 0;

    const blockData = this.buildBlockData();

    this.worker.postMessage({
      type: "start",
      difficulty: this._difficulty,
      blockData,
      blockNumber: this._blockNumber,
      startNonce: 0,
    });

    this.onStatusChange?.(true);

    // Start tracking hash rate history
    this._hashRateHistory = this.loadHashRateHistory();
  }

  /**
   * Stop the mining worker. Terminates the worker to free resources.
   */
  stopMining(): void {
    if (!this._isMining) return;

    this._isMining = false;

    if (this.worker) {
      this.worker.postMessage({ type: "stop" });
      this.worker.terminate();
      this.worker = null;
    }

    this._currentHashRate = 0;
    this.onStatusChange?.(false);
    this.onHashRate?.(0);
  }

  /**
   * Clean up everything. Call on page unmount.
   */
  destroy(): void {
    this.stopMining();
    this.onBlockFound = null;
    this.onHashRate = null;
    this.onStatusChange = null;
  }

  // ─── Private: worker message handler ─────

  private handleWorkerMessage(e: MessageEvent): void {
    const msg = e.data;

    switch (msg.type) {
      case "blockFound":
        this.handleBlockFound(msg.nonce, msg.hash, msg.blockNumber);
        break;

      case "hashRate":
        this._currentHashRate = msg.hashRate;
        this.onHashRate?.(msg.hashRate);
        // Store in history (max 120 entries = 2 minutes)
        this._hashRateHistory.push(msg.hashRate);
        if (this._hashRateHistory.length > 120) {
          this._hashRateHistory = this._hashRateHistory.slice(-120);
        }
        this.saveHashRateHistory(this._hashRateHistory);
        break;

      case "error":
        console.error("[MinerService] Worker reported error:", msg.message);
        this.stopMining();
        break;

      case "pong":
        // Worker is alive
        break;
    }
  }

  private handleBlockFound(nonce: number, hash: string, blockNumber: number): void {
    const now = Date.now();
    const blockTime = now - this.lastBlockStartTime;

    const block: MinedBlock = {
      blockNumber,
      nonce,
      hash,
      timestamp: now,
      reward: REWARD_PER_BLOCK,
    };

    // Save the block
    this.saveBlock(block);

    // Update totals
    this._totalRewards += REWARD_PER_BLOCK;
    this.saveTotalRewards(this._totalRewards);

    this._blockNumber++;
    this.saveBlockNumber(this._blockNumber);

    // Track block time for difficulty adjustment
    this.recentBlockTimes.push(blockTime);
    if (this.recentBlockTimes.length > DIFFICULTY_ADJUST_WINDOW) {
      this.recentBlockTimes.shift();
    }
    this.adjustDifficulty();

    // Notify
    this.onBlockFound?.(block);

    // Automatically start mining the next block
    if (this._isMining) {
      // Re-create worker to start fresh
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }

      this.worker = new Worker("/miner-worker.js");
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = (err) => {
        console.error("[MinerService] Worker error:", err);
        this.stopMining();
      };

      this.lastBlockStartTime = Date.now();
      const blockData = this.buildBlockData();

      this.worker.postMessage({
        type: "start",
        difficulty: this._difficulty,
        blockData,
        blockNumber: this._blockNumber,
        startNonce: 0,
      });
    }
  }

  // ─── Difficulty adjustment ───────────────

  private adjustDifficulty(): void {
    if (this.recentBlockTimes.length < DIFFICULTY_ADJUST_WINDOW) return;

    const avgTime =
      this.recentBlockTimes.reduce((a, b) => a + b, 0) /
      this.recentBlockTimes.length;

    if (avgTime < 10000) {
      // Too fast (< 10s) — increase difficulty
      this._difficulty = Math.min(this._difficulty + 1, 8);
    } else if (avgTime > 30000) {
      // Too slow (> 30s) — decrease difficulty
      this._difficulty = Math.max(this._difficulty - 1, 1);
    }

    this.saveDifficulty(this._difficulty);
  }

  // ─── Block data ──────────────────────────

  private buildBlockData(): string {
    const blocks = this.loadBlocks();
    const prevHash = blocks.length > 0 ? blocks[0].hash : "0".repeat(64);
    const timestamp = Date.now();
    return `${prevHash}:${timestamp}:${this._blockNumber}`;
  }

  // ─── localStorage persistence ────────────

  private safeGet<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch {
      return fallback;
    }
  }

  private safeSet(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota exceeded */
    }
  }

  private loadDifficulty(): number {
    return this.safeGet<number>(STORAGE_KEYS.DIFFICULTY, DEFAULT_DIFFICULTY);
  }

  private saveDifficulty(d: number): void {
    this.safeSet(STORAGE_KEYS.DIFFICULTY, d);
  }

  private loadBlockNumber(): number {
    return this.safeGet<number>(STORAGE_KEYS.BLOCK_NUMBER, 1);
  }

  private saveBlockNumber(n: number): void {
    this.safeSet(STORAGE_KEYS.BLOCK_NUMBER, n);
  }

  private loadTotalRewards(): number {
    return this.safeGet<number>(STORAGE_KEYS.TOTAL_REWARDS, 0);
  }

  private saveTotalRewards(r: number): void {
    this.safeSet(STORAGE_KEYS.TOTAL_REWARDS, r);
  }

  private loadBlocks(): MinedBlock[] {
    return this.safeGet<MinedBlock[]>(STORAGE_KEYS.BLOCKS, []);
  }

  private saveBlock(block: MinedBlock): void {
    const blocks = this.loadBlocks();
    blocks.unshift(block);
    // Keep last 500 blocks
    if (blocks.length > 500) blocks.length = 500;
    this.safeSet(STORAGE_KEYS.BLOCKS, blocks);
  }

  private loadHashRateHistory(): number[] {
    return this.safeGet<number[]>(STORAGE_KEYS.HASH_RATE_HISTORY, []);
  }

  private saveHashRateHistory(history: number[]): void {
    this.safeSet(STORAGE_KEYS.HASH_RATE_HISTORY, history);
  }

  // ─── Singleton ───────────────────────────

  private static instance: MinerService | null = null;

  static getInstance(): MinerService {
    if (!MinerService.instance) {
      MinerService.instance = new MinerService();
    }
    return MinerService.instance;
  }
}

export const minerService = MinerService.getInstance();
