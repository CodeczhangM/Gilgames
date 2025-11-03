import { _decorator, Component, Node, Prefab, instantiate, Vec3, EventTarget } from 'cc';
import { ObjectPool } from './ObjectPool';
import { EnemyBase } from './EnemyBase';
import { PathFollower, FormationType } from './PathFollower';
import { EnemyAi } from './EnemyAi';
const { ccclass, property } = _decorator;

@ccclass('EnemySpawner')
export class EnemySpawner extends Component {
	@property({ tooltip: '与关卡配置的敌人类型键对齐（如："grunt"/"elite"）' })
	typeKey: string = '';
	@property({ tooltip: '优先使用对象池（若设置）' })
	pool: ObjectPool | null = null;

	@property(Prefab)
	prefab: Prefab | null = null;

	@property({ tooltip: '生成到的父节点（为空则使用当前节点的父节点）' })
	spawnRoot: Node | null = null;

	@property({ tooltip: '起始延时（秒）' })
	startDelay: number = 0;

	@property({ tooltip: '触发间隔（秒）' })
	interval: number = 1.5;

	@property({ tooltip: '每次触发生成数量' })
	countPerSpawn: number = 1;

	@property({ tooltip: '总生成数量（<=0 表示无限）' })
	totalCount: number = 0;

	@property({ tooltip: '场上最大同时存活数量（<=0 表示不限制）' })
	maxAlive: number = 0;

	@property({ tooltip: '生成位置相对偏移范围 X（随机 -x..x）' })
	randomOffsetX: number = 0;
	@property({ tooltip: '生成位置相对偏移范围 Y（随机 -y..y）' })
	randomOffsetY: number = 0;

	@property({ tooltip: '自动开始' })
	autoStart: boolean = true;

	// —— PathFollower 对接 ——
	@property({ tooltip: '若设置，将使用其子节点作为路点（按层级顺序）' })
	waypointRoot: Node | null = null;

	@property({ tooltip: '为生成出的单位自动配置 PathFollower 并启动' })
	enablePathFollower: boolean = false;

	@property({ tooltip: '编队类型（影响 PathFollower 的 formation）' })
	formationType: FormationType = FormationType.None;

	@property({ tooltip: '路径组件的 lookAtForward 设置' })
	pfLookAtForward: boolean = false;

	@property({ tooltip: '在路径完成前暂时禁用 EnemyAi，完成时再启用' })
	delayAiUntilPathComplete: boolean = false;

	private _eventBus: EventTarget = new EventTarget();
	private _elapsed = 0;
	private _elapsedDelay = 0;
	private _started = false;
	private _paused = false;
	private _spawnedTotal = 0;
	private _alive = 0;
	private _tmp: Vec3 = new Vec3();

	onLoad() {
		if (!this.spawnRoot) this.spawnRoot = this.node.parent ?? this.node;
	}

	start() {
		if (this.autoStart) this.startSpawn();
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
			this.spawnOnce();
		}
	}

	// 控制 API
	on(event: 'spawn' | 'complete', cb: (data?: any) => void, target?: any) { this._eventBus.on(event, cb, target); }
	off(event: 'spawn' | 'complete', cb: (data?: any) => void, target?: any) { this._eventBus.off(event, cb, target); }
	startSpawn() { this._started = true; this._paused = false; }
	pause() { this._paused = true; }
	resume() { this._paused = false; }
	stop() { this._started = false; this._paused = false; }
	reset() {
		this._elapsed = 0;
		this._elapsedDelay = 0;
		this._spawnedTotal = 0;
		this._alive = 0;
	}

	// 主动触发一轮生成
	spawnOnce() {
		if (!this.spawnRoot) return;
		if (this.totalCount > 0 && this._spawnedTotal >= this.totalCount) {
			this._eventBus.emit('complete');
			this.stop();
			return;
		}
		if (this.maxAlive > 0 && this._alive >= this.maxAlive) return;
		const canSpawn = this._calcSpawnQuota();
		if (canSpawn <= 0) return;
		for (let i = 0; i < canSpawn; i++) {
			const node = this._acquireNode(this.spawnRoot);
			if (!node) break;
			const basePos = this.node.worldPosition.clone();
			const rx = this.randomOffsetX > 0 ? (Math.random() * 2 - 1) * this.randomOffsetX : 0;
			const ry = this.randomOffsetY > 0 ? (Math.random() * 2 - 1) * this.randomOffsetY : 0;
			this._tmp.set(basePos.x + rx, basePos.y + ry, 0);
			node.setWorldPosition(this._tmp);
			this._bindEnemyLifecycle(node);
			this._configurePathAndAi(node, i, canSpawn);
			this._alive++;
			this._spawnedTotal++;
			this._eventBus.emit('spawn', { node });
			if (this.totalCount > 0 && this._spawnedTotal >= this.totalCount) {
				this._eventBus.emit('complete');
				this.stop();
				break;
			}
			if (this.maxAlive > 0 && this._alive >= this.maxAlive) break;
		}
	}

	private _calcSpawnQuota(): number {
		let quota = Math.max(0, this.countPerSpawn | 0);
		if (this.totalCount > 0) {
			quota = Math.min(quota, this.totalCount - this._spawnedTotal);
		}
		if (this.maxAlive > 0) {
			quota = Math.min(quota, this.maxAlive - this._alive);
		}
		return Math.max(0, quota);
	}

	private _acquireNode(parent: Node): Node | null {
		if (this.pool) {
			const n = this.pool.acquire(parent);
			if (n) return n;
		}
		if (this.prefab) {
			const n = instantiate(this.prefab);
			n.parent = parent;
			return n;
		}
		return null;
	}

	private _bindEnemyLifecycle(node: Node) {
		const enemy = node.getComponent(EnemyBase) as EnemyBase | null;
		if (enemy) {
			// 若使用对象池，确保死亡时回收到该池
			if (this.pool && (!enemy.poolHost || enemy.poolHost !== this.pool)) {
				enemy.poolHost = this.pool;
			}
			// 绑定死亡事件，统计存活数
			enemy.off('die', this._onEnemyDie, this);
			enemy.on('die', this._onEnemyDie, this);
		}
	}

	private _configurePathAndAi(node: Node, indexInBatch: number, batchTotal: number) {
		if (!this.enablePathFollower) return;
		let pf = node.getComponent(PathFollower) as PathFollower | null;
		if (!pf) {
			pf = node.addComponent(PathFollower);
		}
		if (!pf) return;
		// 配置路点
		if (this.waypointRoot) {
			const children = this.waypointRoot.children.slice();
			pf.setWaypoints(children);
		}
		// 配置编队
		pf.setFormation(indexInBatch | 0, Math.max(1, batchTotal | 0), this.formationType);
		pf.lookAtForward = this.pfLookAtForward;
		pf.startFollow();
		// AI 延迟到路径完成后再启用
		if (this.delayAiUntilPathComplete) {
			const ai = node.getComponent(EnemyAi) as EnemyAi | null;
			if (ai) {
				ai.enabled = false;
				pf.on('complete', () => {
					if (ai && !ai.enabled && ai.isValid) ai.enabled = true;
				}, this);
			}
		}
	}

	private _onEnemyDie = () => {
		this._alive = Math.max(0, this._alive - 1);
	};
}
