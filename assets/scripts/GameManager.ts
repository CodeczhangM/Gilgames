import { _decorator, Component, EventTarget } from 'cc';
import { PlayerActor } from './core/PlayerActor';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
	private static _instance: GameManager | null = null;

	private eventBus: EventTarget = new EventTarget();
	private sceneSystem: any | null = null;
	private assetSystem: any | null = null;
	private levelSystem: any | null = null;

	private currentScene: string | null = null;
	private currentLevelId: number | null = null;

	public static get instance(): GameManager {
		if (!this._instance) {
			this._instance = new GameManager();
		}
		return this._instance;
	}

	onLoad(): void {
		GameManager._instance = this;
	}

	onDestroy(): void {
		if (GameManager._instance === this) {
			GameManager._instance = null;
		}
	}

	// ========== 全局事件总线 ==========
	on(event: 'player-die' | 'player-hit' | 'player-heal' | 'level-complete' | 'level-fail', cb: (data?: any) => void, target?: any): void {
		this.eventBus.on(event, cb, target);
	}

	off(event: 'player-die' | 'player-hit' | 'player-heal' | 'level-complete' | 'level-fail', cb: (data?: any) => void, target?: any): void {
		this.eventBus.off(event, cb, target);
	}

	private emit(event: string, data?: any): void {
		this.eventBus.emit(event, data);
	}

	// 绑定玩家事件到全局
	public registerPlayer(player: PlayerActor): void {
		player.off('die', this._onPlayerDie, this);
		player.off('hit', this._onPlayerHit, this);
		player.off('heal', this._onPlayerHeal, this);
		player.on('die', this._onPlayerDie, this);
		player.on('hit', this._onPlayerHit, this);
		player.on('heal', this._onPlayerHeal, this);
	}

	private _onPlayerDie = async () => {
		this.emit('player-die');
		await this.failLevel({ reason: 'player-dead' });
		this.emit('level-fail', { reason: 'player-dead' });
	};

	private _onPlayerHit = (data?: any) => {
		this.emit('player-hit', data);
	};

	private _onPlayerHeal = (data?: any) => {
		this.emit('player-heal', data);
	};

	public useSceneSystem(system: any): void {
		this.sceneSystem = system;
	}

	public useAssetSystem(system: any): void {
		this.assetSystem = system;
	}

	public useLevelSystem(system: any): void {
		this.levelSystem = system;
	}

	public initialize(): void {
		// 初始化钩子
	}

	public dispose(): void {
		this.currentScene = null;
		this.currentLevelId = null;
	}

	public async switchScene(sceneName: string, options?: Record<string, any>): Promise<void> {
		await this.onSceneWillChange(sceneName, options);
		if (this.sceneSystem && typeof this.sceneSystem.switch === 'function') {
			await this.sceneSystem.switch(sceneName, options);
			this.currentScene = sceneName;
		} else {
			this.currentScene = sceneName;
		}
		await this.onSceneDidChange(sceneName, options);
	}

	protected async onSceneWillChange(sceneName: string, options?: Record<string, any>): Promise<void> {}

	protected async onSceneDidChange(sceneName: string, options?: Record<string, any>): Promise<void> {}

	public async preloadAssets(assets: Array<string | { path: string; type?: any }>): Promise<void> {
		await this.onAssetsPreloadStart(assets);
		if (this.assetSystem && typeof this.assetSystem.preload === 'function') {
			await this.assetSystem.preload(assets);
		}
		await this.onAssetsPreloadComplete(assets);
	}

	protected async onAssetsPreloadStart(assets: Array<string | { path: string; type?: any }>): Promise<void> {}

	protected async onAssetsPreloadComplete(assets: Array<string | { path: string; type?: any }>): Promise<void> {}

	public async startLevel(levelId: number, options?: Record<string, any>): Promise<void> {
		await this.onLevelWillStart(levelId, options);
		if (this.levelSystem && typeof this.levelSystem.start === 'function') {
			await this.levelSystem.start(levelId, options);
		}
		this.currentLevelId = levelId;
		await this.onLevelDidStart(levelId, options);
	}

	public async completeLevel(result?: Record<string, any>): Promise<void> {
		const levelId = this.currentLevelId;
		if (levelId == null) return;
		await this.onLevelWillComplete(levelId, result);
		if (this.levelSystem && typeof this.levelSystem.complete === 'function') {
			await this.levelSystem.complete(levelId, result);
		}
		await this.onLevelDidComplete(levelId, result);
	}

	public async failLevel(reason?: Record<string, any>): Promise<void> {
		const levelId = this.currentLevelId;
		if (levelId == null) return;
		await this.onLevelWillFail(levelId, reason);
		if (this.levelSystem && typeof this.levelSystem.fail === 'function') {
			await this.levelSystem.fail(levelId, reason);
		}
		await this.onLevelDidFail(levelId, reason);
	}

	// 对外快速触发胜利/失败事件（例如 Boss 被击败时调用）
	public async triggerVictory(result?: Record<string, any>): Promise<void> {
		await this.completeLevel(result);
		this.emit('level-complete', result);
	}

	public async triggerFail(reason?: Record<string, any>): Promise<void> {
		await this.failLevel(reason);
		this.emit('level-fail', reason);
	}

	public async restartLevel(options?: Record<string, any>): Promise<void> {
		if (this.currentLevelId == null) return;
		await this.startLevel(this.currentLevelId, options);
	}

	public async nextLevel(options?: Record<string, any>): Promise<void> {
		if (this.currentLevelId == null) return;
		const nextId = this.currentLevelId + 1;
		await this.startLevel(nextId, options);
	}

	protected async onLevelWillStart(levelId: number, options?: Record<string, any>): Promise<void> {}

	protected async onLevelDidStart(levelId: number, options?: Record<string, any>): Promise<void> {
		// 示例：记录日志、可接入 HUD/UI 初始化
		console.log(`[GameManager] Level ${levelId} started`, options || {});
	}

	protected async onLevelWillComplete(levelId: number, result?: Record<string, any>): Promise<void> {
		// 示例：播放结算前效果或统计数据
		console.log(`[GameManager] Level ${levelId} will complete`, result || {});
	}

	protected async onLevelDidComplete(levelId: number, result?: Record<string, any>): Promise<void> {
		// 示例：展示胜利 UI，或切到下一关
		console.log(`[GameManager] Level ${levelId} completed`, result || {});
	}

	protected async onLevelWillFail(levelId: number, reason?: Record<string, any>): Promise<void> {
		// 示例：播放失败音效/动画
		console.warn(`[GameManager] Level ${levelId} will fail`, reason || {});
	}

	protected async onLevelDidFail(levelId: number, reason?: Record<string, any>): Promise<void> {
		// 示例：展示失败 UI，提供重试/返回菜单
		console.warn(`[GameManager] Level ${levelId} failed`, reason || {});
	}
}

