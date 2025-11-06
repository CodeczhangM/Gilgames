import { _decorator, Component, Node } from 'cc';
import { PickupItem } from './PickupItem';
import { HealthComponent } from './HealthComponent';
const { ccclass, property } = _decorator;

@ccclass('ShieldPickup')
export class ShieldPickup extends PickupItem {
	@property({ tooltip: '护盾值' })
	shieldAmount: number = 50;

	@property({ tooltip: '护盾持续时间（秒），<=0 表示永久' })
	shieldDuration: number = 10;

	@property({ tooltip: '是否叠加到现有护盾' })
	stackShield: boolean = true;

	private shieldTimer: number = 0;
	private activeShield: number = 0;

	onLoad() {
		this.pickupType = 'shield';
	}

	update(dt: number) {
		if (this.shieldDuration > 0 && this.activeShield > 0) {
			this.shieldTimer += dt;
			if (this.shieldTimer >= this.shieldDuration) {
				this.activeShield = 0;
				this.shieldTimer = 0;
			}
		}
	}

	protected onPickupInternal(collector: Node): boolean {
		// 护盾系统需要更复杂的实现，这里提供基础框架
		// 实际可以通过 HealthComponent 扩展或独立的 ShieldComponent
		const health = this.findHealthComponent(collector);
		if (!health) return false;

		// 简单实现：临时增加最大生命值或提供临时保护
		// 完整的护盾系统可能需要独立的 ShieldComponent
		if (this.stackShield) {
			this.activeShield += this.shieldAmount;
		} else {
			this.activeShield = this.shieldAmount;
		}
		this.shieldTimer = 0;
		return true;
	}

	private findHealthComponent(collector: Node): HealthComponent | null {
		let cur: Node | null = collector;
		while (cur) {
			const health = cur.getComponent(HealthComponent);
			if (health) return health;
			cur = cur.parent;
		}
		return null;
	}

	getActiveShield(): number {
		return this.activeShield;
	}
}

