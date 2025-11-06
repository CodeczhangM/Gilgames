import { Collider2D, PhysicsSystem2D, Node } from 'cc';

/**
 * 碰撞层枚举
 * 定义游戏中所有对象的碰撞层
 */
export enum CollisionLayer {
	/** 玩家 */
	Player = 1 << 0, // 1
	/** 敌人 */
	Enemy = 1 << 1, // 2
	/** 玩家子弹 */
	PlayerBullet = 1 << 2, // 4
	/** 敌人子弹 */
	EnemyBullet = 1 << 3, // 8
	/** 掉落物 */
	Pickup = 1 << 4, // 16
	/** 静态障碍物（陨石等） */
	Obstacle = 1 << 5, // 32
	/** 边界/墙壁 */
	Boundary = 1 << 6, // 64
	/** 触发器区域 */
	Trigger = 1 << 7, // 128
}

/**
 * 碰撞层组（用于配置哪些层之间可以碰撞）
 */
export class CollisionGroups {
	/** 玩家组 */
	static readonly Player = CollisionLayer.Player;
	/** 敌人组 */
	static readonly Enemy = CollisionLayer.Enemy;
	/** 玩家子弹组 */
	static readonly PlayerBullet = CollisionLayer.PlayerBullet;
	/** 敌人子弹组 */
	static readonly EnemyBullet = CollisionLayer.EnemyBullet;
	/** 掉落物组 */
	static readonly Pickup = CollisionLayer.Pickup;
	/** 障碍物组 */
	static readonly Obstacle = CollisionLayer.Obstacle;
	/** 边界组 */
	static readonly Boundary = CollisionLayer.Boundary;
	/** 触发器组 */
	static readonly Trigger = CollisionLayer.Trigger;

	/**
	 * 获取所有层的组合
	 */
	static getAll(): number {
		return (
			CollisionLayer.Player |
			CollisionLayer.Enemy |
			CollisionLayer.PlayerBullet |
			CollisionLayer.EnemyBullet |
			CollisionLayer.Pickup |
			CollisionLayer.Obstacle |
			CollisionLayer.Boundary |
			CollisionLayer.Trigger
		);
	}
}

/**
 * 碰撞配置管理器
 * 统一管理碰撞层之间的碰撞关系
 */
export class CollisionManager {
	private static collisionMatrix: Map<CollisionLayer, number> = new Map();

	/**
	 * 初始化碰撞矩阵（配置哪些层之间可以碰撞）
	 */
	static initialize(): void {
		this.collisionMatrix.clear();

		// 玩家可以与：敌人、敌人子弹、掉落物、障碍物、边界碰撞
		this.collisionMatrix.set(
			CollisionLayer.Player,
			CollisionLayer.Enemy |
			CollisionLayer.EnemyBullet |
			CollisionLayer.Pickup |
			CollisionLayer.Obstacle |
			CollisionLayer.Boundary |
			CollisionLayer.Trigger
		);

		// 敌人可以与：玩家、玩家子弹、边界碰撞
		this.collisionMatrix.set(
			CollisionLayer.Enemy,
			CollisionLayer.Player |
			CollisionLayer.PlayerBullet |
			CollisionLayer.Boundary |
			CollisionLayer.Trigger
		);

		// 玩家子弹可以与：敌人、障碍物、边界碰撞
		this.collisionMatrix.set(
			CollisionLayer.PlayerBullet,
			CollisionLayer.Enemy |
			CollisionLayer.Obstacle |
			CollisionLayer.Boundary
		);

		// 敌人子弹可以与：玩家、障碍物、边界碰撞
		this.collisionMatrix.set(
			CollisionLayer.EnemyBullet,
			CollisionLayer.Player |
			CollisionLayer.Obstacle |
			CollisionLayer.Boundary
		);

		// 掉落物可以与：玩家、边界碰撞
		this.collisionMatrix.set(
			CollisionLayer.Pickup,
			CollisionLayer.Player |
			CollisionLayer.Boundary
		);

		// 障碍物可以与：玩家、敌人、玩家子弹、敌人子弹、边界碰撞
		this.collisionMatrix.set(
			CollisionLayer.Obstacle,
			CollisionLayer.Player |
			CollisionLayer.Enemy |
			CollisionLayer.PlayerBullet |
			CollisionLayer.EnemyBullet |
			CollisionLayer.Boundary
		);

		// 边界可以与所有层碰撞
		this.collisionMatrix.set(
			CollisionLayer.Boundary,
			CollisionGroups.getAll()
		);

		// 触发器可以与：玩家、敌人碰撞
		this.collisionMatrix.set(
			CollisionLayer.Trigger,
			CollisionLayer.Player |
			CollisionLayer.Enemy
		);
	}

	/**
	 * 检查两个层是否可以碰撞
	 */
	static canCollide(layer1: CollisionLayer, layer2: CollisionLayer): boolean {
		const mask1 = this.collisionMatrix.get(layer1) || 0;
		const mask2 = this.collisionMatrix.get(layer2) || 0;
		return (mask1 & layer2) !== 0 && (mask2 & layer1) !== 0;
	}

	/**
	 * 获取指定层的碰撞掩码
	 */
	static getCollisionMask(layer: CollisionLayer): number {
		return this.collisionMatrix.get(layer) || 0;
	}

	/**
	 * 设置指定层的碰撞掩码（自定义配置）
	 */
	static setCollisionMask(layer: CollisionLayer, mask: number): void {
		this.collisionMatrix.set(layer, mask);
	}

	/**
	 * 配置Cocos Creator物理系统的碰撞分组
	 * 需要在场景初始化时调用
	 */
	static configurePhysicsGroups(): void {
		// 注意：这里需要根据实际的Cocos Creator版本调整
		// 不同版本的API可能不同
		if (PhysicsSystem2D && PhysicsSystem2D.instance) {
			// 配置物理系统的碰撞分组
			// 具体实现取决于Cocos Creator的版本
			console.log('[CollisionManager] 物理系统碰撞分组配置完成');
		}
	}
}

/**
 * 碰撞工具类
 * 提供便捷的方法来设置和获取碰撞层
 */
export class CollisionHelper {
	/**
	 * 设置节点的碰撞层
	 */
	static setCollisionLayer(node: Node, layer: CollisionLayer): void {
		const colliders = node.getComponents(Collider2D);
		colliders.forEach((collider: Collider2D) => {
			if (collider) {
				// 设置碰撞分组（group）
				(collider as any).group = layer;
				// 设置碰撞掩码（mask）- 可以碰撞的层
				const mask = CollisionManager.getCollisionMask(layer);
				if ((collider as any).mask !== undefined) {
					(collider as any).mask = mask;
				}
			}
		});
	}

	/**
	 * 设置节点的碰撞掩码（可以碰撞的层）
	 */
	static setCollisionMask(node: Node, mask: number): void {
		const colliders = node.getComponents(Collider2D);
		colliders.forEach((collider: Collider2D) => {
			if (collider && (collider as any).mask !== undefined) {
				(collider as any).mask = mask;
			}
		});
	}

	/**
	 * 获取节点的碰撞层
	 */
	static getCollisionLayer(node: Node): CollisionLayer | null {
		const collider = node.getComponent(Collider2D);
		if (collider && (collider as any).group !== undefined) {
			return (collider as any).group as CollisionLayer;
		}
		return null;
	}

	/**
	 * 检查两个节点是否可以碰撞
	 */
	static canNodesCollide(node1: Node, node2: Node): boolean {
		const layer1 = this.getCollisionLayer(node1);
		const layer2 = this.getCollisionLayer(node2);
		if (layer1 === null || layer2 === null) return false;
		return CollisionManager.canCollide(layer1, layer2);
	}

	/**
	 * 根据碰撞层名称获取枚举值
	 */
	static getLayerByName(name: string): CollisionLayer | null {
		const layerMap: Record<string, CollisionLayer> = {
			'Player': CollisionLayer.Player,
			'Enemy': CollisionLayer.Enemy,
			'PlayerBullet': CollisionLayer.PlayerBullet,
			'EnemyBullet': CollisionLayer.EnemyBullet,
			'Pickup': CollisionLayer.Pickup,
			'Obstacle': CollisionLayer.Obstacle,
			'Boundary': CollisionLayer.Boundary,
			'Trigger': CollisionLayer.Trigger,
		};
		return layerMap[name] || null;
	}
}

/**
 * 碰撞层装饰器
 * 用于在组件上标记碰撞层
 */
export function CollisionLayerDecorator(layer: CollisionLayer) {
	return function (target: any) {
		target._collisionLayer = layer;
		return target;
	};
}

