import { _decorator, Component, Node, EventTarget } from 'cc';
import type { DamageContext } from './DamageDealer';
import { Damageable } from './Damageable';
const { ccclass, property } = _decorator;

@ccclass('HealthComponent')
export class HealthComponent extends Component implements Damageable {
	@property
	maxHp: number = 100;

	@property({ tooltip: '受击后无敌帧（秒），<=0 表示无无敌帧' })
	invulnerableDuration: number = 0;

	private hp: number = 1;
	private alive: boolean = false;
	private lastHitTime: number = -9999;
	private bus: EventTarget = new EventTarget();

	onEnable() {
		if (!this.alive) this.revive(this.maxHp);
	}

	// ========== 对外事件订阅 ==========
	on(event: 'hit' | 'die' | 'heal', cb: (data?: any) => void, target?: any) {
		this.bus.on(event, cb, target);
	}
	off(event: 'hit' | 'die' | 'heal', cb: (data?: any) => void, target?: any) {
		this.bus.off(event, cb, target);
	}

	// ========== 状态/生命 ==========
	getHp() { return this.hp; }
	getMaxHp() { return this.maxHp; }
	isAlive() { return this.alive; }

	revive(hp?: number) {
		this.hp = Math.max(1, Math.floor(hp ?? this.maxHp));
		this.alive = true;
	}

	private die(source?: any) {
		if (!this.alive) return;
		this.alive = false;
		this.bus.emit('die', { source });
	}

	// ========== 受击/治疗 ==========
	isInvulnerable(now: number): boolean {
		return this.invulnerableDuration > 0 && (now - this.lastHitTime) < this.invulnerableDuration;
	}

	takeDamageRaw(amount: number, source?: any, now?: number) {
		if (!this.alive) return;
		if (amount <= 0) return;
		const timeNow = now ?? performance.now() / 1000;
		if (this.isInvulnerable(timeNow)) return;
		this.lastHitTime = timeNow;
		this.hp = Math.max(0, this.hp - amount);
		this.bus.emit('hit', { amount, hp: this.hp, source });
		if (this.hp <= 0) {
			this.die(source);
		}
	}

	heal(amount: number) {
		if (amount <= 0) return;
		const prev = this.hp;
		this.hp = Math.min(this.maxHp, this.hp + amount);
		if (this.hp !== prev) this.bus.emit('heal', { amount, hp: this.hp });
	}

	// ========== Damageable 接口实现 ==========
	isDamageableAlive(): boolean { return this.isAlive(); }
	takeDamageByDealer(amount: number, ctx: DamageContext): void { this.takeDamageRaw(amount, ctx?.source, ctx?.now); }
	getDamageableNode(): Node { return this.node; }
}
