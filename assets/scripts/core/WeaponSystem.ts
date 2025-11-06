import { _decorator, Component, Node, instantiate, EventTarget } from 'cc';
import { ResourceManager } from '../resource/ResourceManager';
import { Bullet, BulletFaction, BulletType } from './Bullet';
import { DamageFaction } from './DamageDealer';
const { ccclass, property } = _decorator;

@ccclass('WeaponSystem')
export class WeaponSystem extends Component {
	@property({ tooltip: 'resources 下的子弹预制体路径，如: bullets/player_bullet' })
	bulletPrefabPath: string = '';

	@property({ tooltip: '基础开火间隔（秒）' })
	baseFireInterval: number = 0.15;

	@property({ tooltip: '弹种（可选）' })
	bulletType: BulletType = BulletType.Straight;

	@property({ tooltip: '基础每发伤害' })
	baseDamage: number = 10;

	@property({ tooltip: '子弹寿命（秒），<=0 使用子弹默认' })
	bulletLifetime: number = 0;

	@property({ tooltip: '阵营：决定子弹对谁生效' })
	faction: DamageFaction = DamageFaction.Player;

	@property({ tooltip: '武器当前等级' })
	level: number = 1;

	@property({ tooltip: '最大等级' })
	maxLevel: number = 10;

	@property({ tooltip: '每级伤害提升百分比（如 0.1 表示每级+10%）' })
	damageGrowthPerLevel: number = 0.1;

	@property({ tooltip: '每级射速提升百分比（如 0.05 表示每级射速+5%，间隔缩短）' })
	fireRateGrowthPerLevel: number = 0.05;

	@property({ tooltip: '每级子弹数量增量（如 1 表示每级多发1发，0表示不增加）' })
	bulletCountPerLevel: number = 0;

	@property(Node)
	projectileRoot: Node | null = null;

	private isFiring: boolean = false;
	private elapsed: number = 0;
	private eventBus: EventTarget = new EventTarget();

	// ========== 事件订阅 ==========
	on(event: 'levelUp', cb: (data: { level: number, oldLevel: number }) => void, target?: any) {
		this.eventBus.on(event, cb, target);
	}
	off(event: 'levelUp', cb: (data: { level: number, oldLevel: number }) => void, target?: any) {
		this.eventBus.off(event, cb, target);
	}

	// ========== 等级与属性计算 ==========
	getLevel() { return this.level; }
	getMaxLevel() { return this.maxLevel; }
	canLevelUp() { return this.level < this.maxLevel; }

	/**
	 * 根据当前等级计算实际伤害
	 */
	getCurrentDamage(): number {
		const growth = 1 + (this.level - 1) * this.damageGrowthPerLevel;
		return Math.floor(this.baseDamage * growth);
	}

	/**
	 * 根据当前等级计算实际开火间隔
	 */
	getCurrentFireInterval(): number {
		const rateGrowth = 1 + (this.level - 1) * this.fireRateGrowthPerLevel;
		return Math.max(0.01, this.baseFireInterval / rateGrowth); // 最小间隔0.01秒
	}

	/**
	 * 根据当前等级计算子弹数量
	 */
	getCurrentBulletCount(): number {
		if (this.bulletCountPerLevel <= 0) return 1;
		return 1 + (this.level - 1) * this.bulletCountPerLevel;
	}

	/**
	 * 升级武器
	 * @returns 是否升级成功
	 */
	levelUp(): boolean {
		if (!this.canLevelUp()) return false;
		const oldLevel = this.level;
		this.level = Math.min(this.level + 1, this.maxLevel);
		this.eventBus.emit('levelUp', { level: this.level, oldLevel });
		return true;
	}

	/**
	 * 设置武器等级
	 */
	setLevel(targetLevel: number) {
		const oldLevel = this.level;
		this.level = Math.max(1, Math.min(targetLevel, this.maxLevel));
		if (this.level !== oldLevel) {
			this.eventBus.emit('levelUp', { level: this.level, oldLevel });
		}
	}

	// ========== 开火控制 ==========
	update(dt: number) {
		if (!this.isFiring) return;
		this.elapsed += dt;
		const interval = this.getCurrentFireInterval();
		if (this.elapsed >= interval) {
			this.elapsed = 0;
			this.fireOnce().catch(() => {});
		}
	}

	startFire() {
		this.isFiring = true;
	}

	stopFire() {
		this.isFiring = false;
	}

	async fireOnce() {
		if (!this.bulletPrefabPath) return;
		const rm = ResourceManager.instance;
		if (!rm) return;
		try {
			const prefab = await rm.loadPrefab(this.bulletPrefabPath);
			const bulletCount = this.getCurrentBulletCount();
			const damage = this.getCurrentDamage();
			const bulletFaction = this.faction === DamageFaction.Player ? BulletFaction.Player : BulletFaction.Enemy;

			// 发射多发子弹（如果 bulletCountPerLevel > 0）
			for (let i = 0; i < bulletCount; i++) {
				const node = instantiate(prefab);
				(this.projectileRoot ?? this.node.parent ?? this.node).addChild(node);
				node.setWorldPosition(this.node.worldPosition);

				const bullet = node.getComponent(Bullet);
				if (bullet) {
					bullet.type = this.bulletType;
					bullet.damage = damage;
					bullet.faction = bulletFaction;
					if (this.bulletLifetime > 0) bullet.lifetime = this.bulletLifetime;
				}
			}
		} catch (e) {
			// ignore
		}
	}
}
