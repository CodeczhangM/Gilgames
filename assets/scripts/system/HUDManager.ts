import { _decorator, Component, Node, Label, ProgressBar } from 'cc';
import { ScoreSystem } from '../utils/ScoreSystem';
import { GameManager } from '../GameManager';
const { ccclass, property } = _decorator;

@ccclass('HUDManager')
export class HUDManager extends Component {
	// ===== 引用 =====
	@property({ tooltip: '玩家根节点（用于侦听生命与技能事件）' })
	playerNode: Node | null = null;

	@property({ type: ScoreSystem, tooltip: '分数系统（默认自动从 GameManager 获取）' })
	scoreSystem: ScoreSystem | null = null;

	// ===== 分数/连击/时间/击杀 =====
	@property(Label)
	scoreLabel: Label | null = null;
	@property(Label)
	comboLabel: Label | null = null;
	@property(Label)
	killsLabel: Label | null = null;
	@property(Label)
	timeLabel: Label | null = null;

	// ===== 生命值 =====
	@property(ProgressBar)
	hpBar: ProgressBar | null = null;
	@property(Label)
	hpText: Label | null = null;

	// ===== 技能冷却 =====
	@property(ProgressBar)
	skillCdBar: ProgressBar | null = null;
	@property(Label)
	skillCdText: Label | null = null;

	// ===== 内部状态 =====
	private _lastSkillCastTime: number = -9999;
	private _playerSkillCooldown: number = 0;
	private _timeAccum: number = 0; // 用于拉取时间显示（也可直接从 ScoreSystem 获取）

	onLoad() {
		if (!this.scoreSystem) {
			const gm = GameManager.instance;
			this.scoreSystem = gm?.getScoreSystem?.() || null;
		}
		this.bindScoreEvents();
		this.bindPlayer(this.playerNode);
		this.refreshAll();
	}

	onDestroy() {
		this.unbindScoreEvents();
		this.unbindPlayer(this.playerNode);
	}

	update(dt: number) {
		this.updateTime();
		this.updateSkillCooldown();
	}

	// ===== 绑定分数系统 =====
	private bindScoreEvents() {
		if (!this.scoreSystem) return;
		this.scoreSystem.on('scoreChange', this.onScoreChanged, this);
		this.scoreSystem.on('comboChange', this.onComboChanged, this);
		this.scoreSystem.on('comboBreak', this.onComboBreak, this);
		this.scoreSystem.on('kill', this.onKill, this);
	}
	private unbindScoreEvents() {
		if (!this.scoreSystem) return;
		this.scoreSystem.off('scoreChange', this.onScoreChanged, this);
		this.scoreSystem.off('comboChange', this.onComboChanged, this);
		this.scoreSystem.off('comboBreak', this.onComboBreak, this);
		this.scoreSystem.off('kill', this.onKill, this);
	}

	private onScoreChanged = () => { this.updateScore(); };
	private onComboChanged = () => { this.updateCombo(); };
	private onComboBreak = () => { this.updateCombo(); };
	private onKill = () => { this.updateKills(); };

	// ===== 绑定玩家 =====
	public bindPlayer(player: Node | null) {
		this.unbindPlayer(this.playerNode);
		this.playerNode = player;
		if (!player) return;
		// 生命组件
		const health = player.getComponent('HealthComponent' as any) as any;
		if (health) {
			health.on('hit', this.onPlayerHpChanged, this);
			health.on('heal', this.onPlayerHpChanged, this);
			health.on('die', this.onPlayerHpChanged, this);
		}
		// 技能事件
		const actor = player.getComponent('PlayerActor' as any) as any;
		if (actor) {
			this._playerSkillCooldown = Number(actor.skillCooldown ?? 0) || 0;
			actor.on('skill', this.onPlayerSkillCast, this);
		}
		this.updateHp();
		this.updateSkillCooldown(true);
	}

	public unbindPlayer(player: Node | null) {
		if (!player) return;
		const health = player.getComponent('HealthComponent' as any) as any;
		if (health) {
			health.off('hit', this.onPlayerHpChanged, this);
			health.off('heal', this.onPlayerHpChanged, this);
			health.off('die', this.onPlayerHpChanged, this);
		}
		const actor = player.getComponent('PlayerActor' as any) as any;
		if (actor) {
			actor.off('skill', this.onPlayerSkillCast, this);
		}
	}

	private onPlayerHpChanged = () => { this.updateHp(); };
	private onPlayerSkillCast = () => {
		this._lastSkillCastTime = this.scoreSystem ? this.scoreSystem.getTimeElapsed?.() ?? 0 : 0;
		this.updateSkillCooldown(true);
	};

	// ===== 刷新显示 =====
	private refreshAll() {
		this.updateScore();
		this.updateCombo();
		this.updateKills();
		this.updateTime();
		this.updateHp();
		this.updateSkillCooldown(true);
	}

	private updateScore() {
		if (!this.scoreSystem) return;
		const total = this.scoreSystem.getTotalScore?.() ?? 0;
		if (this.scoreLabel) this.scoreLabel.string = `${total}`;
	}
	private updateCombo() {
		if (!this.scoreSystem) return;
		const combo = this.scoreSystem.getCurrentCombo?.() ?? 0;
		const text = combo > 1 ? `x${combo}` : '';
		if (this.comboLabel) this.comboLabel.string = text;
	}
	private updateKills() {
		if (!this.scoreSystem) return;
		const kills = this.scoreSystem.getKills?.() ?? 0;
		if (this.killsLabel) this.killsLabel.string = `${kills}`;
	}
	private updateTime() {
		if (!this.scoreSystem) return;
		const t = this.scoreSystem.getTimeElapsed?.() ?? 0;
		if (this.timeLabel) this.timeLabel.string = this.formatTime(t);
	}
	private updateHp() {
		if (!this.playerNode) return;
		const health = this.playerNode.getComponent('HealthComponent' as any) as any;
		if (!health) return;
		const cur = Number(health.getHp?.() ?? 0) || 0;
		const max = Number(health.maxHp ?? 0) || 0;
		if (this.hpBar && max > 0) this.hpBar.progress = Math.max(0, Math.min(1, cur / max));
		if (this.hpText) this.hpText.string = `${cur}/${max}`;
	}
	private updateSkillCooldown(force: boolean = false) {
		if (!this.playerNode) return;
		const actor = this.playerNode.getComponent('PlayerActor' as any) as any;
		if (!actor) return;
		const cooldown = Number(actor.skillCooldown ?? this._playerSkillCooldown ?? 0) || 0;
		this._playerSkillCooldown = cooldown;
		if (cooldown <= 0) {
			if (this.skillCdBar) this.skillCdBar.progress = 1;
			if (this.skillCdText) this.skillCdText.string = '';
			return;
		}
		const now = this.scoreSystem ? this.scoreSystem.getTimeElapsed?.() ?? 0 : 0;
		const dt = now - this._lastSkillCastTime;
		const ratio = Math.max(0, Math.min(1, dt / cooldown));
		if (this.skillCdBar) this.skillCdBar.progress = ratio;
		if (this.skillCdText) {
			const left = Math.max(0, cooldown - dt);
			this.skillCdText.string = left > 0 ? left.toFixed(1) + 's' : '';
		}
	}

	// ===== 工具 =====
	private formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		const mm = m < 10 ? `0${m}` : `${m}`;
		const ss = s < 10 ? `0${s}` : `${s}`;
		return `${mm}:${ss}`;
	}
}
