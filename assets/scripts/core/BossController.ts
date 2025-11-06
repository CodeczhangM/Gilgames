import { _decorator, Component, Node, Color, UIOpacity, Tween, tween, Vec3, EventTarget } from 'cc';
import { EnemyBase } from './EnemyBase';
import { BossEnemy } from './BossEnemy';
import { HealthComponent } from './HealthComponent';
import { GameManager } from '../GameManager';
const { ccclass, property } = _decorator;

export interface BossSkill {
	key: string; // 技能唯一键
	cooldown: number; // 冷却（秒）
	weight?: number; // 抽选权重（默认1）
	castTime?: number; // 前摇/施放时间（秒）
	data?: Record<string, any>; // 额外数据（弹幕参数等）
}

export interface BossPhaseConfig {
	id: number; // 阶段编号（1开始）
	hpRatioEnter?: number; // 进入阶段的血量阈值（0~1），如 0.66 进入P2
	duration?: number; // 可选：基于时间的阶段切换（秒）
	skills: BossSkill[]; // 阶段技能池
	moveSpeedMultiplier?: number; // 阶段移速倍率
	enrage?: boolean; // 是否狂暴（可用于演出）
}

export interface WeakPointConfig {
	node: Node; // 弱点节点
	damageMultiplier: number; // 伤害倍率（例如2.0）
	flashColor?: Color; // 命中反馈颜色（叠加）
	flashDuration?: number; // 闪烁时长（秒）
}

@ccclass('BossController')
export class BossController extends Component {
	@property({ tooltip: 'Boss 敌人（若为空将自动在当前节点查找）' })
	boss: BossEnemy | null = null;

	@property({ tooltip: '阶段配置，按 id 或 hpRatioEnter 从小到大排序' })
	phaseConfigs: BossPhaseConfig[] = [] as any;

	@property({ tooltip: '弱点节点（命中反馈与伤害加成）' })
	weakPoints: WeakPointConfig[] = [] as any;

	@property({ tooltip: '技能最短触发间隔（防止过密）' })
	globalSkillGap: number = 0.2;

	@property({ tooltip: '是否自动开始（onEnable）' })
	autoStart: boolean = true;

	private eventBus: EventTarget = new EventTarget();
	private health: HealthComponent | null = null;
	private enemyBase: EnemyBase | null = null;

	private currentPhaseId: number = 1;
	private lastSkillTime: number = -9999;
	private skillCooldownMap: Map<string, number> = new Map();
	private phaseStartTime: number = 0;
	private elapsed: number = 0;
	private running: boolean = false;
	private victorySent: boolean = false;

	onEnable() {
		if (!this.boss) this.boss = this.getComponent(BossEnemy);
		this.enemyBase = (this.boss as EnemyBase) || this.getComponent(EnemyBase);
		if (!this.enemyBase) return;
		this.enemyBase.isBoss = true;

		this.health = this.enemyBase.getComponent(HealthComponent);
		if (this.health) {
			this.health.on('hit', this.onBossHit, this);
			this.health.on('die', this.onBossDie, this);
		}

		if (this.autoStart) this.startControl();
	}

	onDisable() {
		if (this.health) {
			this.health.off('hit', this.onBossHit, this);
			this.health.off('die', this.onBossDie, this);
		}
		this.stopControl();
	}

	// 事件
	on(event: 'phase-change' | 'skill-cast' | 'weak-hit' | 'enrage' | 'start' | 'stop' | 'die', cb: (data?: any) => void, target?: any) {
		this.eventBus.on(event, cb, target);
	}
	off(event: 'phase-change' | 'skill-cast' | 'weak-hit' | 'enrage' | 'start' | 'stop' | 'die', cb: (data?: any) => void, target?: any) {
		this.eventBus.off(event, cb, target);
	}

	startControl() {
		this.running = true;
		this.elapsed = 0;
		this.phaseStartTime = 0;
		this.currentPhaseId = this.computePhaseByHp();
		this.eventBus.emit('start', { phase: this.currentPhaseId });
	}

	stopControl() {
		this.running = false;
		this.eventBus.emit('stop');
	}

	update(dt: number) {
		if (!this.running || !this.enemyBase || !this.enemyBase.isAlive()) return;
		this.elapsed += dt;
		if (this.phaseStartTime === 0) this.phaseStartTime = this.elapsed;

		// 检查阶段切换
		const phaseByHp = this.computePhaseByHp();
		const phaseByTime = this.computePhaseByTime();
		const nextPhase = Math.max(phaseByHp, phaseByTime);
		if (nextPhase !== this.currentPhaseId) {
			this.setPhase(nextPhase);
		}

		// 技能驱动
		this.tryCastSkill();
	}

	// ========== 阶段相关 ==========
	private computePhaseByHp(): number {
		if (!this.health || this.phaseConfigs.length === 0) return 1;
		const hpRatio = Math.max(0, Math.min(1, this.health.getHp() / Math.max(1, this.enemyBase?.maxHp || 1)));
		let phase = 1;
		for (const p of this.sortedPhases()) {
			if (p.hpRatioEnter != null) {
				if (hpRatio <= p.hpRatioEnter) phase = Math.max(phase, p.id);
			}
		}
		return phase;
	}

	private computePhaseByTime(): number {
		if (this.phaseConfigs.length === 0) return 1;
		const tInPhase = this.elapsed - this.phaseStartTime;
		let phase = this.currentPhaseId;
		for (const p of this.sortedPhases()) {
			if (p.duration != null && p.id > this.currentPhaseId) {
				const totalPrev = this.accumulatedDurationUntil(p.id);
				if (this.elapsed >= totalPrev) phase = p.id;
			}
		}
		return phase;
	}

	private accumulatedDurationUntil(phaseId: number): number {
		let sum = 0;
		for (const p of this.sortedPhases()) {
			if (p.id < phaseId) sum += (p.duration || 0);
		}
		return sum;
	}

	private sortedPhases(): BossPhaseConfig[] {
		return this.phaseConfigs.slice().sort((a, b) => a.id - b.id);
	}

	private setPhase(phaseId: number) {
		this.currentPhaseId = phaseId;
		this.phaseStartTime = this.elapsed;
		const cfg = this.getPhaseConfig(phaseId);
		if (cfg?.enrage) this.eventBus.emit('enrage', { phase: phaseId });
		this.eventBus.emit('phase-change', { phase: phaseId, config: cfg });
	}

	private getPhaseConfig(phaseId: number): BossPhaseConfig | null {
		return this.phaseConfigs.find(p => p.id === phaseId) || null;
	}

	// ========== 技能相关 ==========
	private tryCastSkill() {
		const cfg = this.getPhaseConfig(this.currentPhaseId);
		if (!cfg || !this.enemyBase) return;

		// 全局间隔
		const now = this.elapsed;
		if (now - this.lastSkillTime < this.globalSkillGap) return;

		// 从可用技能中抽选
		const candidates = cfg.skills.filter(s => this.isSkillReady(s.key, s.cooldown));
		if (candidates.length === 0) return;
		const skill = this.pickByWeight(candidates);
		if (!skill) return;

		// 标记冷却 & 触发事件（由外部实际执行技能）
		this.lastSkillTime = now;
		this.skillCooldownMap.set(skill.key, now);
		this.eventBus.emit('skill-cast', { phase: this.currentPhaseId, skill });
	}

	private isSkillReady(key: string, cd: number): boolean {
		const last = this.skillCooldownMap.get(key) ?? -9999;
		return (this.elapsed - last) >= Math.max(0, cd || 0);
	}

	private pickByWeight(skills: BossSkill[]): BossSkill | null {
		const total = skills.reduce((acc, s) => acc + (s.weight ?? 1), 0);
		if (total <= 0) return skills[0] ?? null;
		let r = Math.random() * total;
		for (const s of skills) {
			r -= (s.weight ?? 1);
			if (r <= 0) return s;
		}
		return skills[skills.length - 1] ?? null;
	}

	// ========== 弱点相关 ==========
	private onBossHit = (data?: any) => {
		if (!data) return;
		for (const wp of this.weakPoints) {
			if (!wp?.node?.isValid) continue;
			this.flashNode(wp.node, wp.flashColor ?? new Color(255, 120, 120, 255), wp.flashDuration ?? 0.1);
		}
		this.eventBus.emit('weak-hit', data);
	};

	private onBossDie = () => {
		if (this.victorySent) return;
		this.victorySent = true;
		this.running = false;
		this.eventBus.emit('die', { phase: this.currentPhaseId });
		// 通知全局胜利
		try {
			const gm = GameManager.instance;
			if (gm && typeof gm.triggerVictory === 'function') {
				gm.triggerVictory({ boss: this.node.name }).catch(() => {});
			}
		} catch {}
	};

	private flashNode(node: Node, color: Color, duration: number) {
		const ui = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
		const original = ui.opacity;
		const tw = tween(ui).to(duration, { opacity: 50 }).to(duration, { opacity: original });
		tw.start();
	}
}
