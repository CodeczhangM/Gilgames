import { _decorator, Component, Node, Prefab, instantiate, Vec3, Quat, tween, UIOpacity } from 'cc';
import { ResourceManager } from '../resource/ResourceManager';
const { ccclass, property } = _decorator;

export interface PlayVfxOptions {
	parent?: Node | null; // 挂载的父节点（默认当前管理器节点）
	offset?: Vec3; // 相对偏移
	rotation?: Quat; // 旋转
	scale?: number; // 缩放（统一缩放）
	ttl?: number; // 生存时间（秒），到时间后自动回收
}

export interface TrailOptions {
	followTime?: number; // 跟随时长（秒），到时自动移除
	offset?: Vec3; // 跟随时相对偏移
	scale?: number; // 缩放
}

@ccclass('VFXManager')
export class VFXManager extends Component {
	private static _instance: VFXManager | null = null;
	public static get instance(): VFXManager | null { return this._instance; }

	@property({ tooltip: '是否使用对象池' })
	usePool: boolean = true;

	@property({ tooltip: '每种特效的最大缓存数量' })
	maxPoolSizePerKey: number = 16;

	// 对象池：key 为 prefab 路径
	private pool: Map<string, Node[]> = new Map();
	private active: Set<Node> = new Set();

	onLoad() {
		VFXManager._instance = this;
	}

	onDestroy() {
		if (VFXManager._instance === this) VFXManager._instance = null;
		this.clearAll();
	}

	// ========== 基础 API ==========
	/**
	 * 在世界坐标播放一次性特效
	 */
	public async playOnce(prefabPath: string, worldPos: Vec3, options: PlayVfxOptions = {}): Promise<Node | null> {
		const vfx = await this.spawn(prefabPath, options.parent ?? this.node);
		if (!vfx) return null;
		vfx.setWorldPosition(worldPos);
		this.applyTransform(vfx, options);
		this.autoRecycle(vfx, prefabPath, options.ttl ?? 0.6);
		return vfx;
	}

	/**
	 * 在某节点上播放特效（相对位移/旋转）
	 */
	public async playOnNode(prefabPath: string, host: Node, options: PlayVfxOptions = {}): Promise<Node | null> {
		const vfx = await this.spawn(prefabPath, options.parent ?? host);
		if (!vfx) return null;
		const base = host.worldPosition.clone();
		vfx.setWorldPosition(base);
		this.applyTransform(vfx, options);
		this.autoRecycle(vfx, prefabPath, options.ttl ?? 0.5);
		return vfx;
	}

	/**
	 * 生成持久特效（需手动回收）
	 */
	public async spawnPersistent(prefabPath: string, parent?: Node): Promise<Node | null> {
		return this.spawn(prefabPath, parent ?? this.node);
	}

	/** 回收（或销毁）特效节点 */
	public recycle(node: Node, prefabPath?: string) {
		if (!node || !node.isValid) return;
		this.active.delete(node);
		if (this.usePool && prefabPath) {
			const list = this.pool.get(prefabPath) ?? [];
			if (list.length < this.maxPoolSizePerKey) {
				list.push(node);
				this.pool.set(prefabPath, list);
				node.removeFromParent();
				node.active = false;
				return;
			}
		}
		node.destroy();
	}

	/** 清空所有对象池与活动特效 */
	public clearAll() {
		this.active.forEach(n => { if (n.isValid) n.destroy(); });
		this.active.clear();
		this.pool.forEach(list => list.forEach(n => { if (n.isValid) n.destroy(); }));
		this.pool.clear();
	}

	// ========== 预置特化 API ==========
	/** 枪口火焰 */
	public async spawnMuzzleFlash(gunNode: Node, prefabPath: string, ttl: number = 0.15): Promise<Node | null> {
		return this.playOnNode(prefabPath, gunNode, { ttl, parent: gunNode.parent ?? this.node });
	}

	/** 命中特效（子弹命中敌人/环境） */
	public async spawnHitEffect(prefabPath: string, worldPos: Vec3, ttl: number = 0.4): Promise<Node | null> {
		return this.playOnce(prefabPath, worldPos, { ttl, parent: this.node });
	}

	/** 爆炸特效 */
	public async spawnExplosion(prefabPath: string, worldPos: Vec3, ttl: number = 0.8): Promise<Node | null> {
		return this.playOnce(prefabPath, worldPos, { ttl, parent: this.node });
	}

	/**
	 * 子弹拖尾：生成一个跟随目标的特效，跟随 followTime 秒后移除
	 */
	public async attachTrail(target: Node, prefabPath: string, options: TrailOptions = {}): Promise<Node | null> {
		const vfx = await this.spawn(prefabPath, target);
		if (!vfx) return null;
		if (options.scale && vfx) vfx.setScale(options.scale, options.scale, 1);
		if (options.offset) {
			const wp = target.worldPosition.clone().add(options.offset);
			vfx.setWorldPosition(wp);
		}
		const followTime = Math.max(0.05, options.followTime ?? 0.5);
		this.scheduleOnce(() => {
			this.recycle(vfx, prefabPath);
		}, followTime);
		return vfx;
	}

	// ========== 内部工具 ==========
	private async spawn(prefabPath: string, parent: Node): Promise<Node | null> {
		let node: Node | null = null;
		if (this.usePool) {
			const list = this.pool.get(prefabPath);
			if (list && list.length > 0) {
				node = list.pop()!;
			}
		}
		if (!node) {
			try {
				const prefab = await ResourceManager.instance?.loadPrefab(prefabPath);
				if (!prefab) return null;
				node = instantiate(prefab as Prefab);
			} catch (e) {
				return null;
			}
		}
		if (!node) return null;
		parent.addChild(node);
		node.active = true;
		this.active.add(node);
		return node;
	}

	private applyTransform(node: Node, options: PlayVfxOptions) {
		if (options.offset) {
			const wp = node.worldPosition.clone().add(options.offset);
			node.setWorldPosition(wp);
		}
		if (options.rotation) node.setWorldRotation(options.rotation);
		if (options.scale) node.setScale(options.scale, options.scale, 1);
	}

	private autoRecycle(node: Node, prefabPath: string, ttl: number) {
		const time = Math.max(0.05, ttl || 0.1);
		this.scheduleOnce(() => {
			this.recycle(node, prefabPath);
		}, time);
	}
}
