import type { Node } from 'cc';
import type { DamageContext } from './DamageDealer';

export interface Damageable {
	/** 是否可被继续结算（如死亡/无敌则返回 false） */
	isDamageableAlive(): boolean;
	/** 由 DamageDealer 统一入口调用的受伤接口 */
	takeDamageByDealer(amount: number, ctx: DamageContext): void;
	/** 返回所属节点，便于后续通用处理（如特效/位移） */
	getDamageableNode(): Node;
}

export function isDamageable(obj: any): obj is Damageable {
	return !!obj && typeof obj.isDamageableAlive === 'function' && typeof obj.takeDamageByDealer === 'function' && typeof obj.getDamageableNode === 'function';
}
