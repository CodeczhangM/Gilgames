import { _decorator, Component, Node, Vec3, instantiate, EventTarget } from 'cc';
import { DropType, EnemyDropItem, LevelData, EnemyType } from '../level/LevelData';
import { PickupItem } from '../core/PickupItem';
import { WeaponPickup } from '../core/WeaponPickup';
import { HealthPickup } from '../core/HealthPickup';
import { ShieldPickup } from '../core/ShieldPickup';
import { ObjectPool } from '../core/ObjectPool';
import { ResourceManager } from '../resource/ResourceManager';
const { ccclass, property } = _decorator;

export interface DropResult {
	dropped: boolean;
	items: Node[];
	type: DropType;
}

@ccclass('DropSystem')
export class DropSystem extends Component {
	@property({ tooltip: '拾取物父节点（用于放置掉落物）' })
	dropRoot: Node | null = null;

	@property({ tooltip: '武器升级预制体路径' })
	weaponUpgradePrefabPath: string = 'pickups/weapon_upgrade';

	@property({ tooltip: '生命恢复预制体路径' })
	healthPrefabPath: string = 'pickups/health';

	@property({ tooltip: '护盾预制体路径' })
	shieldPrefabPath: string = 'pickups/shield';

	@property({ tooltip: '金币预制体路径' })
	coinPrefabPath: string = 'pickups/coin';

	@property({ tooltip: '掉落物对象池（可选）' })
	dropPool: ObjectPool | null = null;

	@property({ tooltip: '掉落物初始速度（向玩家方向）' })
	dropVelocity: number = 100;

	@property({ tooltip: '掉落物重力' })
	dropGravity: number = 200;

	private currentLevelData: LevelData | null = null;
	private eventBus: EventTarget = new EventTarget();

	onLoad() {
		if (!this.dropRoot) {
			this.dropRoot = this.node.parent || this.node;
		}
	}

	// ========== 事件订阅 ==========
	on(event: 'drop', cb: (data: DropResult) => void, target?: any) {
		this.eventBus.on(event, cb, target);
	}
	off(event: 'drop', cb: (data: DropResult) => void, target?: any) {
		this.eventBus.off(event, cb, target);
	}

	// ========== 关卡数据管理 ==========
	/**
	 * 设置当前关卡数据
	 */
	setLevelData(levelData: LevelData): void {
		this.currentLevelData = levelData;
	}

	/**
	 * 获取当前关卡数据
	 */
	getLevelData(): LevelData | null {
		return this.currentLevelData;
	}

	// ========== 掉落处理 ==========
	/**
	 * 根据掉落配置生成掉落物
	 * @param position 掉落位置
	 * @param dropItems 掉落配置列表
	 * @param isBoss 是否为Boss掉落（固定掉落）
	 * @param enemyType 敌人类型（用于获取默认掉落表）
	 */
	async dropItems(
		position: Vec3,
		dropItems: EnemyDropItem[] | null,
		isBoss: boolean = false,
		enemyType?: EnemyType
	): Promise<DropResult[]> {
		const results: DropResult[] = [];

		// 如果没有指定掉落配置，尝试从关卡数据获取
		if (!dropItems && this.currentLevelData) {
			dropItems = this.getDropConfigForEnemy(enemyType, isBoss);
		}

		if (!dropItems || dropItems.length === 0) {
			return results;
		}

		// 处理每个掉落项
		for (const dropItem of dropItems) {
			// Boss固定掉落（chance >= 1.0）或随机掉落
			const shouldDrop = isBoss || dropItem.chance >= 1.0 || Math.random() < dropItem.chance;
			
			if (shouldDrop) {
				const count = dropItem.count || 1;
				for (let i = 0; i < count; i++) {
					const node = await this.createDropItem(dropItem.type, position, dropItem.data);
					if (node) {
						results.push({
							dropped: true,
							items: [node],
							type: dropItem.type,
						});
					}
				}
			}
		}

		// 触发掉落事件
		results.forEach(result => {
			this.eventBus.emit('drop', result);
		});

		return results;
	}

	/**
	 * 从关卡数据获取敌人掉落配置
	 */
	private getDropConfigForEnemy(enemyType?: EnemyType, isBoss: boolean = false): EnemyDropItem[] | null {
		if (!this.currentLevelData) return null;

		// Boss掉落
		if (isBoss && this.currentLevelData.boss?.drops) {
			return this.currentLevelData.boss.drops;
		}

		// 从waves中查找对应敌人的掉落配置
		for (const wave of this.currentLevelData.waves) {
			for (const spawn of wave.spawns) {
				if (spawn.type === enemyType && spawn.drops) {
					return spawn.drops;
				}
			}
		}

		// 使用默认掉落表
		return this.currentLevelData.defaultDrops || null;
	}

	/**
	 * 创建掉落物节点
	 */
	private async createDropItem(
		dropType: DropType,
		position: Vec3,
		extraData?: Record<string, any>
	): Promise<Node | null> {
		let prefabPath: string = '';
		let pickupComponent: string = '';

		// 根据掉落类型确定预制体路径和组件
		switch (dropType) {
			case DropType.WeaponUpgrade:
			case DropType.WeaponStraight:
			case DropType.WeaponSpread:
			case DropType.WeaponHoming:
			case DropType.WeaponLaser:
			case DropType.WeaponRocket:
				prefabPath = extraData?.prefabPath || this.weaponUpgradePrefabPath;
				pickupComponent = 'WeaponPickup';
				break;
			case DropType.Health:
				prefabPath = extraData?.prefabPath || this.healthPrefabPath;
				pickupComponent = 'HealthPickup';
				break;
			case DropType.Shield:
				prefabPath = extraData?.prefabPath || this.shieldPrefabPath;
				pickupComponent = 'ShieldPickup';
				break;
			case DropType.Coin:
				prefabPath = extraData?.prefabPath || this.coinPrefabPath;
				pickupComponent = 'PickupItem'; // 或创建CoinPickup
				break;
			default:
				console.warn(`[DropSystem] 未知掉落类型: ${dropType}`);
				return null;
		}

		// 从对象池获取或创建新节点
		let node: Node | null = null;
		if (this.dropPool && this.dropPool.isValid) {
			node = this.dropPool.acquire(this.dropRoot || this.node);
		}

		if (!node) {
			// 加载预制体
			const rm = ResourceManager.instance;
			if (!rm) return null;

			try {
				const prefab = await rm.loadPrefab(prefabPath);
				node = instantiate(prefab);
				(this.dropRoot || this.node.parent || this.node).addChild(node);
			} catch (e) {
				console.error(`[DropSystem] 加载掉落物预制体失败: ${prefabPath}`, e);
				return null;
			}
		}

		// 设置位置
		node.setWorldPosition(position);

		// 配置拾取组件
		this.configurePickupComponent(node, dropType, extraData);

		// 添加掉落物理效果（可选）
		this.applyDropPhysics(node, position);

		return node;
	}

	/**
	 * 配置拾取组件
	 */
	private configurePickupComponent(node: Node, dropType: DropType, extraData?: Record<string, any>): void {
		// 武器掉落
		if (dropType === DropType.WeaponUpgrade || 
			dropType === DropType.WeaponStraight ||
			dropType === DropType.WeaponSpread ||
			dropType === DropType.WeaponHoming ||
			dropType === DropType.WeaponLaser ||
			dropType === DropType.WeaponRocket) {
			const weaponPickup = node.getComponent(WeaponPickup);
			if (weaponPickup) {
				weaponPickup.weaponPickupMode = extraData?.mode || 0; // Upgrade
				weaponPickup.levelUpAmount = extraData?.levelUpAmount || 1;
				if (extraData?.weaponType) {
					// 可以设置特定武器类型
				}
			}
		}

		// 生命掉落
		if (dropType === DropType.Health) {
			const healthPickup = node.getComponent(HealthPickup);
			if (healthPickup) {
				healthPickup.healAmount = extraData?.healAmount || 20;
				healthPickup.healPercent = extraData?.healPercent || 0;
			}
		}

		// 护盾掉落
		if (dropType === DropType.Shield) {
			const shieldPickup = node.getComponent(ShieldPickup);
			if (shieldPickup) {
				shieldPickup.shieldAmount = extraData?.shieldAmount || 50;
				shieldPickup.shieldDuration = extraData?.shieldDuration || 10;
			}
		}

		// 设置对象池（如果使用）
		const pickup = node.getComponent(PickupItem);
		if (pickup && this.dropPool) {
			pickup.poolHost = this.dropPool;
		}
	}

	/**
	 * 应用掉落物理效果（可选：添加初始速度等）
	 */
	private applyDropPhysics(node: Node, position: Vec3): void {
		// 可以添加简单的物理效果，如初始速度、重力等
		// 这里提供一个基础框架，实际实现可能需要物理组件
		if (this.dropVelocity > 0) {
			// 可以添加一个简单的移动组件或使用物理引擎
		}
	}

	// ========== 便捷方法 ==========
	/**
	 * 掉落单个物品（便捷方法）
	 */
	async dropItem(position: Vec3, dropType: DropType, data?: Record<string, any>): Promise<Node | null> {
		const result = await this.dropItems(position, [{ type: dropType, chance: 1.0, data }], false);
		return result.length > 0 ? result[0].items[0] : null;
	}

	/**
	 * Boss固定掉落
	 */
	async dropBossRewards(position: Vec3, bossConfig?: { drops?: EnemyDropItem[] }): Promise<DropResult[]> {
		const drops = bossConfig?.drops || (this.currentLevelData?.boss?.drops);
		if (!drops) return [];
		return await this.dropItems(position, drops, true);
	}
}
