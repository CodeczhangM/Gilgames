import { _decorator, Component, Node } from 'cc';
import { PickupItem } from './PickupItem';
import { HealthComponent } from './HealthComponent';
const { ccclass, property } = _decorator;

@ccclass('HealthPickup')
export class HealthPickup extends PickupItem {
	@property({ tooltip: '恢复生命值' })
	healAmount: number = 20;

	@property({ tooltip: '恢复百分比（0-1），优先级高于固定值' })
	healPercent: number = 0;

	onLoad() {
		this.pickupType = 'health';
	}

	protected onPickupInternal(collector: Node): boolean {
		const health = this.findHealthComponent(collector);
		if (!health) return false;

		let amount = this.healAmount;
		if (this.healPercent > 0) {
			amount = Math.floor(health.getMaxHp() * this.healPercent);
		}
		health.heal(amount);
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
}

