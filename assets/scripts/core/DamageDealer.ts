import { Node } from 'cc';
import { isDamageable, Damageable } from './Damageable';

export enum DamageFaction {
	Player = 'Player',
	Enemy = 'Enemy',
}

export type DamageContext = {
	/** 伤害来源（如子弹组件/节点等） */
	source?: any;
	/** 阵营（便于后续统一判定友伤/免疫等规则） */
	faction?: DamageFaction;
	/** 时间戳（用于无敌帧等判定，秒） */
	now?: number;
};

export class DamageDealer {
	/**
	 * 尝试对命中的节点应用伤害。返回是否成功造成有效伤害。
	 */
	static dealDamage(targetNode: Node, amount: number, ctx?: DamageContext): boolean {
		if (amount <= 0) return false;

		const dmg = this.findDamageableInNodeOrParent(targetNode);
		if (!dmg) return false;
		if (!dmg.isDamageableAlive()) return false;
		dmg.takeDamageByDealer(amount, ctx ?? {});
		return true;
	}

	private static findDamageableInNodeOrParent(node: Node): Damageable | null {
		let cur: Node | null = node;
		while (cur) {
			const comps = cur.components as any[];
			for (const c of comps) {
				if (isDamageable(c)) return c as Damageable;
			}
			cur = cur.parent;
		}
		return null;
	}
}
