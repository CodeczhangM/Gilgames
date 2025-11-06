import { _decorator, Component, Node, EventTarget } from 'cc';
import { PickupItem } from './PickupItem';
const { ccclass, property } = _decorator;

export enum ItemType {
	SpeedBoost = 'SpeedBoost', // 速度提升
	DamageBoost = 'DamageBoost', // 伤害提升
	FireRateBoost = 'FireRateBoost', // 射速提升
	MultiShot = 'MultiShot', // 多发子弹
	Custom = 'Custom', // 自定义
}

@ccclass('ItemPickup')
export class ItemPickup extends PickupItem {
	@property({ tooltip: '道具类型' })
	itemType: ItemType = ItemType.Custom;

	@property({ tooltip: '道具持续时间（秒），<=0 表示永久' })
	duration: number = 10;

	@property({ tooltip: '速度提升百分比（仅在 SpeedBoost 模式下）' })
	speedBoostPercent: number = 0.2;

	@property({ tooltip: '伤害提升百分比（仅在 DamageBoost 模式下）' })
	damageBoostPercent: number = 0.3;

	@property({ tooltip: '射速提升百分比（仅在 FireRateBoost 模式下）' })
	fireRateBoostPercent: number = 0.25;

	@property({ tooltip: '额外子弹数量（仅在 MultiShot 模式下）' })
	extraBulletCount: number = 1;

	@property({ tooltip: '自定义道具效果数据（JSON 字符串）' })
	customData: string = '';

	private eventBus: EventTarget = new EventTarget();

	onLoad() {
		this.pickupType = 'item';
	}

	// ========== 事件订阅 ==========
	on(event: 'apply', cb: (data: any) => void, target?: any) {
		this.eventBus.on(event, cb, target);
	}
	off(event: 'apply', cb: (data: any) => void, target?: any) {
		this.eventBus.off(event, cb, target);
	}

	protected onPickupInternal(collector: Node): boolean {
		// 触发道具效果应用事件，由外部系统处理
		const effectData = this.buildEffectData();
		this.eventBus.emit('apply', { itemType: this.itemType, data: effectData, duration: this.duration, collector });
		return true;
	}

	private buildEffectData(): any {
		switch (this.itemType) {
			case ItemType.SpeedBoost:
				return { speedBoost: this.speedBoostPercent };
			case ItemType.DamageBoost:
				return { damageBoost: this.damageBoostPercent };
			case ItemType.FireRateBoost:
				return { fireRateBoost: this.fireRateBoostPercent };
			case ItemType.MultiShot:
				return { extraBullets: this.extraBulletCount };
			case ItemType.Custom:
				try {
					return JSON.parse(this.customData || '{}');
				} catch {
					return {};
				}
			default:
				return {};
		}
	}
}

