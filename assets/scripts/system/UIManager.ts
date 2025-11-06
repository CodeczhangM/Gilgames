import { _decorator, Component, Node, director, Label } from 'cc';
import { GameManager } from '../GameManager';
import { ScoreSystem } from '../utils/ScoreSystem';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
	@property({ tooltip: '暂停面板根节点' })
	pausePanel: Node | null = null;

	@property({ tooltip: '胜利结算面板根节点' })
	victoryPanel: Node | null = null;

	@property({ tooltip: '失败结算面板根节点' })
	failPanel: Node | null = null;

	@property({ tooltip: 'HUD 根节点（可在暂停/结算时隐藏）' })
	hudRoot: Node | null = null;

	@property({ tooltip: '暂停时隐藏 HUD' })
	hideHudOnPause: boolean = false;

	@property({ tooltip: '当关卡完成/失败时自动显示结算面板' })
	autoHookGameManager: boolean = true;

	private _isPaused: boolean = false;

	onLoad() {
		if (this.autoHookGameManager) this.bindGameEvents();
		this.hideAllPanels();
	}

	onDestroy() {
		if (this.autoHookGameManager) this.unbindGameEvents();
	}

	// 事件绑定
	private bindGameEvents() {
		const gm = GameManager.instance;
		if (!gm) return;
		gm.on('level-complete', this.onLevelComplete, this);
		gm.on('level-fail', this.onLevelFail, this);
	}

	private unbindGameEvents() {
		const gm = GameManager.instance;
		if (!gm) return;
		gm.off('level-complete', this.onLevelComplete, this);
		gm.off('level-fail', this.onLevelFail, this);
	}

	// ===== 暂停控制 =====
	public pause(): void {
		if (this._isPaused) return;
		this._isPaused = true;
		director.pause();
		this.setActive(this.pausePanel, true);
		if (this.hideHudOnPause) this.setActive(this.hudRoot, false);
	}

	public resume(): void {
		if (!this._isPaused) return;
		this._isPaused = false;
		director.resume();
		this.setActive(this.pausePanel, false);
		if (this.hideHudOnPause) this.setActive(this.hudRoot, true);
	}

	public togglePause(): void { this._isPaused ? this.resume() : this.pause(); }

	// ===== 结算面板 =====
	private onLevelComplete = (result?: any) => {
		this.resume(); // 确保恢复（若处于暂停）
		this.showVictory(result);
	};

	private onLevelFail = (reason?: any) => {
		this.resume();
		this.showFail(reason);
	};

	public showVictory(result?: any): void {
		this.hideAllPanels();
		this.setActive(this.victoryPanel, true);
		this.fillSettlementTexts(this.victoryPanel, true);
	}

	public showFail(reason?: any): void {
		this.hideAllPanels();
		this.setActive(this.failPanel, true);
		this.fillSettlementTexts(this.failPanel, false);
	}

	private fillSettlementTexts(panel: Node | null, isWin: boolean) {
		if (!panel) return;
		// 可选：从 ScoreSystem 填充分数、连击、击杀、时间
		const gm = GameManager.instance;
		const score = gm?.getScoreSystem?.();
		if (score) {
			const total = score.getTotalScore?.() ?? 0;
			const kills = score.getKills?.() ?? 0;
			const maxCombo = score.getMaxCombo?.() ?? 0;
			const time = score.getTimeElapsed?.() ?? 0;
			this.setLabel(panel, 'ScoreValue', `${total}`);
			this.setLabel(panel, 'KillsValue', `${kills}`);
			this.setLabel(panel, 'ComboValue', `${maxCombo}`);
			this.setLabel(panel, 'TimeValue', this.formatTime(time));
		}
		this.setLabel(panel, 'ResultTitle', isWin ? '胜利' : '失败');
	}

	// ===== Button 事件（在编辑器绑定） =====
	onClickPause() { this.pause(); }
	onClickResume() { this.resume(); }

	onClickRestart() {
		const gm = GameManager.instance;
		this.resume();
		gm?.restartLevel?.().catch?.(() => {});
	}

	onClickNext() {
		const gm = GameManager.instance;
		this.resume();
		gm?.nextLevel?.().catch?.(() => {});
	}

	onClickQuitToMenu() {
		const gm = GameManager.instance;
		this.resume();
		// 若有主菜单场景名，可修改下行
		gm?.switchScene?.('MainMenu').catch?.(() => {});
	}

	// ===== 工具 =====
	private hideAllPanels() {
		this.setActive(this.pausePanel, false);
		this.setActive(this.victoryPanel, false);
		this.setActive(this.failPanel, false);
	}

	private setActive(node: Node | null, active: boolean) {
		if (node && node.isValid) node.active = active;
	}

	private setLabel(root: Node, pathOrName: string, text: string) {
		// 简化：在直接子节点里按名称查找 Label
		const child = root.getChildByName(pathOrName);
		const label = child?.getComponent(Label);
		if (label) label.string = text;
	}

	private formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		const mm = m < 10 ? `0${m}` : `${m}`;
		const ss = s < 10 ? `0${s}` : `${s}`;
		return `${mm}:${ss}`;
	}
}
