import { _decorator, Component, Node } from 'cc';
import { PickupItem } from './PickupItem';
import { WeaponSystem } from './WeaponSystem';
const { ccclass, property } = _decorator;

export enum WeaponPickupType {
	Upgrade = 'Upgrade', // 升级现有武器
	Replace = 'Replace', // 替换为新武器
}

@ccclass('WeaponPickup')
export class WeaponPickup extends PickupItem {
	@property({ tooltip: '拾取类型：升级/替换' })
	weaponPickupMode: WeaponPickupType = WeaponPickupType.Upgrade;

	@property({ tooltip: '武器等级提升（仅在 Upgrade 模式下生效）' })
	levelUpAmount: number = 1;

	@property({ tooltip: '新武器预制体路径（仅在 Replace 模式下生效）' })
	newWeaponPrefabPath: string = '';

	@property({ tooltip: '目标武器系统节点（空则自动查找）' })
	targetWeaponNode: Node | null = null;

	onLoad() {
		this.pickupType = 'weapon';
	}

	protected onPickupInternal(collector: Node): boolean {
		const weapon = this.findWeaponSystem(collector);
		if (!weapon) return false;

		if (this.weaponPickupMode === WeaponPickupType.Upgrade) {
			// 升级现有武器
			for (let i = 0; i < this.levelUpAmount; i++) {
				if (!weapon.canLevelUp()) break;
				weapon.levelUp();
			}
			return true;
		} else if (this.weaponPickupMode === WeaponPickupType.Replace) {
			// 替换武器（需要外部系统处理，这里仅触发事件）
			// 实际替换逻辑可能需要更复杂的系统
			return true;
		}
		return false;
	}

	private findWeaponSystem(collector: Node): WeaponSystem | null {
		if (this.targetWeaponNode) {
			return this.targetWeaponNode.getComponent(WeaponSystem);
		}
		// 自动查找
		let cur: Node | null = collector;
		while (cur) {
			const weapon = cur.getComponent(WeaponSystem);
			if (weapon) return weapon;
			cur = cur.parent;
		}
		return null;
	}
}

