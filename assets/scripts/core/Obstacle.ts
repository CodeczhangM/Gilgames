import { _decorator, Component, Node } from 'cc';
import { CollisionLayer, CollisionHelper } from './CollisionLayers';
import { Damageable } from './Damageable';
import { HealthComponent } from './HealthComponent';
const { ccclass, property } = _decorator;

/**
 * 静态障碍物组件（如陨石）
 */
@ccclass('Obstacle')
export class Obstacle extends Component implements Damageable {
	@property
	maxHp: number = 100;

	@property({ tooltip: '是否可以破坏' })
	destructible: boolean = true;

	@property(HealthComponent)
	health: HealthComponent | null = null;

	onLoad() {
		this.setupCollisionLayer();
		if (this.destructible) {
			if (!this.health) this.health = this.getComponent(HealthComponent);
			if (this.health) {
				this.health.maxHp = this.maxHp;
				this.health.revive(this.maxHp);
				this.health.on('die', () => {
					this.onDestroyed();
				}, this);
			}
		}
	}

	private setupCollisionLayer() {
		CollisionHelper.setCollisionLayer(this.node, CollisionLayer.Obstacle);
	}

	private onDestroyed() {
		// 障碍物被破坏时的处理
		if (this.node.isValid) {
			this.node.destroy();
		}
	}

	// ========== Damageable 接口实现（可选，用于可破坏的障碍物） ==========
	isDamageableAlive(): boolean {
		return this.destructible && this.health ? this.health.isAlive() : false;
	}

	takeDamageByDealer(amount: number, ctx: any): void {
		if (this.destructible && this.health) {
			this.health.takeDamageRaw(amount, ctx?.source, ctx?.now);
		}
	}

	getDamageableNode(): Node {
		return this.node;
	}
}

