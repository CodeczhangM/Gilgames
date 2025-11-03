import { _decorator, Component, Node, EventTarget } from 'cc';
import { EnemySpawner } from './EnemySpawner';
const { ccclass, property } = _decorator;

export enum SpawnSelectMode {
	All = 'All',
	Sequence = 'Sequence',
	RandomSubset = 'RandomSubset',
	WeightedRandom = 'WeightedRandom',
}

export enum SpawnTriggerAction {
	SpawnOnce = 'SpawnOnce',
	StartSpawner = 'StartSpawner',
}

@ccclass('SpawnManager')
export class SpawnManager extends Component {
	@property({ type: [EnemySpawner], tooltip: '管理的 Spawner 列表（可留空，启用 autoCollectUnder 自动收集）' })
	spawners: EnemySpawner[] = [];

	@property({ tooltip: '自动收集该节点下的所有 EnemySpawner（优先与 spawners 合并去重）' })
	autoCollectUnder: Node | null = null;

	@property({ tooltip: '起始延时（秒）' })
	startDelay: number = 0;

	@property({ tooltip: '触发间隔（秒）' })
	interval: number = 2;

	@property({ tooltip: '回合总数（<=0 表示无限）' })
	totalRounds: number = 0;

	@property({ tooltip: '选择模式' })
	mode: SpawnSelectMode = SpawnSelectMode.All;

	@property({ tooltip: '每回合选择的 Spawner 数量（用于 RandomSubset/WeightedRandom）' })
	subsetCount: number = 1;

	@property({ tooltip: '权重（与 spawners 数组一一对应），留空则默认权重=1' })
	weightsCsv: string = '';

	@property({ tooltip: '触发行为：SpawnOnce（触发一次）、StartSpawner（调用 startSpawn）' })
	action: SpawnTriggerAction = SpawnTriggerAction.SpawnOnce;

	@property({ tooltip: '自动开始' })
	autoStart: boolean = true;

	private _eventBus: EventTarget = new EventTarget();
	private _started = false;
	private _paused = false;
	private _elapsedDelay = 0;
	private _elapsed = 0;
	private _round = 0;
	private _seqIndex = 0;
	private _weights: number[] = [];

	onLoad() {
		this._collectSpawners();
		this._parseWeights();
	}

	start() {
		if (this.autoStart) this.startRun();
	}

	update(dt: number) {
		if (!this._started || this._paused) return;
		if (this._elapsedDelay < this.startDelay) {
			this._elapsedDelay += dt;
			return;
		}
		this._elapsed += dt;
		if (this._elapsed >= Math.max(0.01, this.interval)) {
			this._elapsed = 0;
			this._runOneRound();
		}
	}

	// 事件 API
	on(event: 'round' | 'complete', cb: (data?: any) => void, target?: any) { this._eventBus.on(event, cb, target); }
	off(event: 'round' | 'complete', cb: (data?: any) => void, target?: any) { this._eventBus.off(event, cb, target); }

	// 控制 API
	startRun() { this._started = true; this._paused = false; }
	pause() { this._paused = true; }
	resume() { this._paused = false; }
	stop() { this._started = false; this._paused = false; }
	reset() {
		this._elapsedDelay = 0;
		this._elapsed = 0;
		this._round = 0;
		this._seqIndex = 0;
	}
	setSpawners(list: EnemySpawner[]) {
		this.spawners = (list || []).filter(Boolean);
		this._parseWeights();
	}

	private _collectSpawners() {
		if (!this.autoCollectUnder) return;
		const autos = this.autoCollectUnder.getComponentsInChildren(EnemySpawner) || [];
		const merged: EnemySpawner[] = [];
		const seen = new Set<EnemySpawner>();
		for (const s of this.spawners) { if (s && !seen.has(s)) { merged.push(s); seen.add(s); } }
		for (const s of autos) { if (s && !seen.has(s)) { merged.push(s); seen.add(s); } }
		this.spawners = merged;
	}

	private _parseWeights() {
		if (!this.spawners || this.spawners.length === 0) { this._weights = []; return; }
		const parts = (this.weightsCsv || '').split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
		this._weights = new Array(this.spawners.length).fill(1);
		for (let i = 0; i < Math.min(parts.length, this._weights.length); i++) {
			this._weights[i] = Math.max(0, parts[i]);
		}
	}

	private _runOneRound() {
		if (!this.spawners || this.spawners.length === 0) return;
		if (this.totalRounds > 0 && this._round >= this.totalRounds) {
			this._eventBus.emit('complete');
			this.stop();
			return;
		}
		this._round++;
		switch (this.mode) {
			case SpawnSelectMode.All:
				this._triggerAll();
				break;
			case SpawnSelectMode.Sequence:
				this._triggerSequence();
				break;
			case SpawnSelectMode.RandomSubset:
				this._triggerRandomSubset();
				break;
			case SpawnSelectMode.WeightedRandom:
				this._triggerWeightedRandom();
				break;
		}
		this._eventBus.emit('round', { round: this._round });
	}

	private _trigger(spawner: EnemySpawner) {
		if (!spawner || !spawner.isValid) return;
		switch (this.action) {
			case SpawnTriggerAction.SpawnOnce:
				spawner.spawnOnce();
				break;
			case SpawnTriggerAction.StartSpawner:
				spawner.startSpawn();
				break;
		}
	}

	private _triggerAll() {
		for (const s of this.spawners) this._trigger(s);
	}

	private _triggerSequence() {
		if (this.spawners.length === 0) return;
		const s = this.spawners[this._seqIndex % this.spawners.length];
		this._seqIndex = (this._seqIndex + 1) % this.spawners.length;
		this._trigger(s);
	}

	private _triggerRandomSubset() {
		const n = this.spawners.length;
		const k = Math.max(1, Math.min(this.subsetCount | 0, n));
		const idxs = this._sampleWithoutReplacement(n, k);
		for (const i of idxs) this._trigger(this.spawners[i]);
	}

	private _triggerWeightedRandom() {
		const n = this.spawners.length;
		const k = Math.max(1, Math.min(this.subsetCount | 0, n));
		const idxs = this._weightedSampleWithoutReplacement(this._weights, k);
		for (const i of idxs) this._trigger(this.spawners[i]);
	}

	private _sampleWithoutReplacement(n: number, k: number): number[] {
		const arr = Array.from({ length: n }, (_, i) => i);
		for (let i = n - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr.slice(0, k);
	}

	private _weightedSampleWithoutReplacement(weights: number[], k: number): number[] {
		const n = Math.min(weights.length, this.spawners.length);
		const selected: number[] = [];
		const alive = new Array(n).fill(true);
		for (let pick = 0; pick < k; pick++) {
			let total = 0;
			for (let i = 0; i < n; i++) if (alive[i]) total += Math.max(0, weights[i] || 0);
			if (total <= 0) break;
			let r = Math.random() * total;
			let chosen = -1;
			for (let i = 0; i < n; i++) {
				if (!alive[i]) continue;
				r -= Math.max(0, weights[i] || 0);
				if (r <= 0) { chosen = i; break; }
			}
			if (chosen < 0) break;
			selected.push(chosen);
			alive[chosen] = false;
		}
		return selected;
	}
}
