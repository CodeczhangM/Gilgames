import { _decorator, Component, Node, EventTarget, sys } from 'cc';
import { GameManager } from '../GameManager';
const { ccclass, property } = _decorator;

// 关卡进度数据
export interface LevelProgress {
    levelId: number;
    isUnlocked: boolean;          // 是否已解锁
    isCompleted: boolean;         // 是否已完成
    bestScore: number;            // 最高分
    bestKills: number;            // 最高击杀数
    bestCombo: number;            // 最高连击数
    bestTime: number;             // 最佳通关时间（秒）
    completedCount: number;       // 完成次数
    lastPlayTime: number;         // 最后游玩时间戳
}

// 游戏进度数据
export interface GameProgress {
    currentLevelId: number;       // 当前进度（已到达的最高关卡）
    unlockedLevels: Set<number>;  // 已解锁的关卡ID集合
    levelProgresses: Map<number, LevelProgress>; // 关卡进度数据
    totalPlayTime: number;        // 总游戏时长（秒）
    totalScore: number;           // 累计总分数
    lastSaveTime: number;         // 最后保存时间戳
    version: string;              // 存档版本号
}

@ccclass('SaveSystem')
export class SaveSystem extends Component {
    private static _instance: SaveSystem | null = null;
    private static readonly SAVE_KEY = 'gilgames_game_progress';
    private static readonly SAVE_VERSION = '1.0.0';

    private eventBus: EventTarget = new EventTarget();
    private gameProgress: GameProgress;

    @property({ tooltip: '是否在关卡完成时自动保存' })
    autoSaveOnComplete: boolean = true;

    @property({ tooltip: '是否在关卡失败时自动保存最高分' })
    autoSaveOnFail: boolean = true;

    public static get instance(): SaveSystem | null {
        return SaveSystem._instance;
    }

    onLoad() {
        SaveSystem._instance = this;
        this.gameProgress = this.loadProgress();
        this.setupEventListeners();
    }

    onDestroy() {
        if (SaveSystem._instance === this) {
            SaveSystem._instance = null;
        }
        this.removeEventListeners();
    }

    // ========== 事件订阅 ==========
    on(event: 'progressChanged' | 'levelUnlocked' | 'bestScoreUpdated', 
        cb: (data?: any) => void, target?: any) {
        this.eventBus.on(event, cb, target);
    }

    off(event: 'progressChanged' | 'levelUnlocked' | 'bestScoreUpdated', 
        cb: (data?: any) => void, target?: any) {
        this.eventBus.off(event, cb, target);
    }

    // ========== 进度管理 ==========
    /**
     * 获取当前进度
     */
    getCurrentLevelId(): number {
        return this.gameProgress.currentLevelId;
    }

    /**
     * 设置当前进度
     */
    setCurrentLevelId(levelId: number): void {
        if (levelId > this.gameProgress.currentLevelId) {
            this.gameProgress.currentLevelId = levelId;
            this.saveProgress();
            this.eventBus.emit('progressChanged', { currentLevelId: levelId });
        }
    }

    /**
     * 获取关卡进度
     */
    getLevelProgress(levelId: number): LevelProgress | null {
        return this.gameProgress.levelProgresses.get(levelId) || null;
    }

    /**
     * 检查关卡是否已解锁
     */
    isLevelUnlocked(levelId: number): boolean {
        if (levelId <= 1) return true; // 第一关默认解锁
        return this.gameProgress.unlockedLevels.has(levelId) || 
               this.getLevelProgress(levelId)?.isUnlocked === true;
    }

    /**
     * 检查关卡是否已完成
     */
    isLevelCompleted(levelId: number): boolean {
        return this.getLevelProgress(levelId)?.isCompleted === true;
    }

    /**
     * 解锁关卡
     */
    unlockLevel(levelId: number): boolean {
        if (this.isLevelUnlocked(levelId)) return false;

        this.gameProgress.unlockedLevels.add(levelId);
        let progress = this.gameProgress.levelProgresses.get(levelId);
        if (!progress) {
            progress = this.createLevelProgress(levelId);
            this.gameProgress.levelProgresses.set(levelId, progress);
        }
        progress.isUnlocked = true;

        this.saveProgress();
        this.eventBus.emit('levelUnlocked', { levelId });
        return true;
    }

    /**
     * 完成关卡
     */
    completeLevel(levelId: number, scoreData?: {
        score?: number;
        kills?: number;
        combo?: number;
        time?: number;
    }): void {
        let progress = this.gameProgress.levelProgresses.get(levelId);
        if (!progress) {
            progress = this.createLevelProgress(levelId);
            this.gameProgress.levelProgresses.set(levelId, progress);
        }

        // 更新完成状态
        progress.isCompleted = true;
        progress.isUnlocked = true;
        progress.completedCount += 1;
        progress.lastPlayTime = Date.now();

        // 更新最佳成绩
        let bestScoreUpdated = false;
        if (scoreData) {
            if (scoreData.score !== undefined && scoreData.score > progress.bestScore) {
                progress.bestScore = scoreData.score;
                bestScoreUpdated = true;
            }
            if (scoreData.kills !== undefined && scoreData.kills > progress.bestKills) {
                progress.bestKills = scoreData.kills;
            }
            if (scoreData.combo !== undefined && scoreData.combo > progress.bestCombo) {
                progress.bestCombo = scoreData.combo;
            }
            if (scoreData.time !== undefined && 
                (progress.bestTime === 0 || scoreData.time < progress.bestTime)) {
                progress.bestTime = scoreData.time;
            }
        }

        // 更新当前进度
        if (levelId >= this.gameProgress.currentLevelId) {
            this.gameProgress.currentLevelId = levelId;
        }

        // 解锁下一关
        const nextLevelId = levelId + 1;
        if (nextLevelId > 1) {
            this.unlockLevel(nextLevelId);
        }

        // 更新总分数
        if (scoreData?.score) {
            this.gameProgress.totalScore += scoreData.score;
        }

        this.saveProgress();
        this.eventBus.emit('progressChanged', { levelId, completed: true });
        if (bestScoreUpdated) {
            this.eventBus.emit('bestScoreUpdated', { levelId, score: progress.bestScore });
        }
    }

    /**
     * 更新关卡最高分（用于关卡失败时保存）
     */
    updateLevelBestScore(levelId: number, scoreData: {
        score?: number;
        kills?: number;
        combo?: number;
    }): boolean {
        let progress = this.gameProgress.levelProgresses.get(levelId);
        if (!progress) {
            progress = this.createLevelProgress(levelId);
            this.gameProgress.levelProgresses.set(levelId, progress);
        }

        let updated = false;
        if (scoreData.score !== undefined && scoreData.score > progress.bestScore) {
            progress.bestScore = scoreData.score;
            updated = true;
        }
        if (scoreData.kills !== undefined && scoreData.kills > progress.bestKills) {
            progress.bestKills = scoreData.kills;
            updated = true;
        }
        if (scoreData.combo !== undefined && scoreData.combo > progress.bestCombo) {
            progress.bestCombo = scoreData.combo;
            updated = true;
        }

        if (updated) {
            progress.lastPlayTime = Date.now();
            this.saveProgress();
            this.eventBus.emit('bestScoreUpdated', { levelId, score: progress.bestScore });
        }

        return updated;
    }

    /**
     * 获取关卡最高分
     */
    getLevelBestScore(levelId: number): number {
        return this.getLevelProgress(levelId)?.bestScore || 0;
    }

    /**
     * 获取所有已解锁的关卡ID
     */
    getUnlockedLevels(): number[] {
        return Array.from(this.gameProgress.unlockedLevels).sort((a, b) => a - b);
    }

    /**
     * 获取所有已完成的关卡ID
     */
    getCompletedLevels(): number[] {
        const completed: number[] = [];
        this.gameProgress.levelProgresses.forEach((progress, levelId) => {
            if (progress.isCompleted) {
                completed.push(levelId);
            }
        });
        return completed.sort((a, b) => a - b);
    }

    /**
     * 获取总游戏时长
     */
    getTotalPlayTime(): number {
        return this.gameProgress.totalPlayTime;
    }

    /**
     * 增加游戏时长
     */
    addPlayTime(deltaTime: number): void {
        this.gameProgress.totalPlayTime += deltaTime;
    }

    /**
     * 获取累计总分数
     */
    getTotalScore(): number {
        return this.gameProgress.totalScore;
    }

    /**
     * 创建关卡进度数据
     */
    private createLevelProgress(levelId: number): LevelProgress {
        return {
            levelId,
            isUnlocked: levelId <= 1, // 第一关默认解锁
            isCompleted: false,
            bestScore: 0,
            bestKills: 0,
            bestCombo: 0,
            bestTime: 0,
            completedCount: 0,
            lastPlayTime: 0,
        };
    }

    // ========== 数据持久化 ==========
    /**
     * 保存进度
     */
    saveProgress(): boolean {
        try {
            this.gameProgress.lastSaveTime = Date.now();
            const saveData = this.serializeProgress();
            const json = JSON.stringify(saveData);
            
            // 使用 Cocos 的 sys.localStorage 或浏览器 localStorage
            if (sys.localStorage) {
                sys.localStorage.setItem(SaveSystem.SAVE_KEY, json);
            } else if (typeof localStorage !== 'undefined') {
                localStorage.setItem(SaveSystem.SAVE_KEY, json);
            } else {
                console.warn('[SaveSystem] localStorage 不可用');
                return false;
            }
            
            return true;
        } catch (e) {
            console.error('[SaveSystem] 保存进度失败:', e);
            return false;
        }
    }

    /**
     * 加载进度
     */
    loadProgress(): GameProgress {
        try {
            let json: string | null = null;
            if (sys.localStorage) {
                json = sys.localStorage.getItem(SaveSystem.SAVE_KEY);
            } else if (typeof localStorage !== 'undefined') {
                json = localStorage.getItem(SaveSystem.SAVE_KEY);
            }

            if (!json) {
                return this.createDefaultProgress();
            }

            const saveData = JSON.parse(json);
            return this.deserializeProgress(saveData);
        } catch (e) {
            console.error('[SaveSystem] 加载进度失败:', e);
            return this.createDefaultProgress();
        }
    }

    /**
     * 创建默认进度
     */
    private createDefaultProgress(): GameProgress {
        const progress: GameProgress = {
            currentLevelId: 1,
            unlockedLevels: new Set([1]),
            levelProgresses: new Map(),
            totalPlayTime: 0,
            totalScore: 0,
            lastSaveTime: Date.now(),
            version: SaveSystem.SAVE_VERSION,
        };

        // 初始化第一关
        const level1 = this.createLevelProgress(1);
        level1.isUnlocked = true;
        progress.levelProgresses.set(1, level1);

        return progress;
    }

    /**
     * 序列化进度数据（转换 Set 和 Map 为 JSON 可序列化格式）
     */
    private serializeProgress(): any {
        return {
            currentLevelId: this.gameProgress.currentLevelId,
            unlockedLevels: Array.from(this.gameProgress.unlockedLevels),
            levelProgresses: Array.from(this.gameProgress.levelProgresses.entries()),
            totalPlayTime: this.gameProgress.totalPlayTime,
            totalScore: this.gameProgress.totalScore,
            lastSaveTime: this.gameProgress.lastSaveTime,
            version: this.gameProgress.version,
        };
    }

    /**
     * 反序列化进度数据（恢复 Set 和 Map）
     */
    private deserializeProgress(saveData: any): GameProgress {
        const progress: GameProgress = {
            currentLevelId: Number(saveData.currentLevelId ?? 1),
            unlockedLevels: new Set(saveData.unlockedLevels ?? [1]),
            levelProgresses: new Map(),
            totalPlayTime: Number(saveData.totalPlayTime ?? 0),
            totalScore: Number(saveData.totalScore ?? 0),
            lastSaveTime: Number(saveData.lastSaveTime ?? Date.now()),
            version: String(saveData.version ?? SaveSystem.SAVE_VERSION),
        };

        // 恢复关卡进度数据
        if (Array.isArray(saveData.levelProgresses)) {
            saveData.levelProgresses.forEach(([levelId, data]: [number, any]) => {
                progress.levelProgresses.set(Number(levelId), {
                    levelId: Number(levelId),
                    isUnlocked: Boolean(data?.isUnlocked ?? false),
                    isCompleted: Boolean(data?.isCompleted ?? false),
                    bestScore: Number(data?.bestScore ?? 0),
                    bestKills: Number(data?.bestKills ?? 0),
                    bestCombo: Number(data?.bestCombo ?? 0),
                    bestTime: Number(data?.bestTime ?? 0),
                    completedCount: Number(data?.completedCount ?? 0),
                    lastPlayTime: Number(data?.lastPlayTime ?? 0),
                });
            });
        }

        // 如果存档版本较旧，可以在这里进行数据迁移
        if (progress.version !== SaveSystem.SAVE_VERSION) {
            this.migrateProgress(progress, saveData.version);
        }

        return progress;
    }

    /**
     * 数据迁移（处理旧版本存档）
     */
    private migrateProgress(progress: GameProgress, oldVersion: string): void {
        // 数据迁移逻辑
        console.log(`[SaveSystem] 迁移存档从版本 ${oldVersion} 到 ${SaveSystem.SAVE_VERSION}`);
        progress.version = SaveSystem.SAVE_VERSION;
    }

    /**
     * 清空所有进度（重置游戏）
     */
    resetProgress(): void {
        this.gameProgress = this.createDefaultProgress();
        this.saveProgress();
        this.eventBus.emit('progressChanged', { reset: true });
    }

    /**
     * 删除存档
     */
    deleteSave(): boolean {
        try {
            if (sys.localStorage) {
                sys.localStorage.removeItem(SaveSystem.SAVE_KEY);
            } else if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(SaveSystem.SAVE_KEY);
            }
            this.gameProgress = this.createDefaultProgress();
            return true;
        } catch (e) {
            console.error('[SaveSystem] 删除存档失败:', e);
            return false;
        }
    }

    // ========== 事件监听 ==========
    private setupEventListeners(): void {
        // 监听 GameManager 的关卡完成事件（延迟绑定，避免初始化顺序问题）
        this.scheduleOnce(() => {
            const gameManager = GameManager.instance;
            if (gameManager) {
                gameManager.on('level-complete', this.onLevelComplete, this);
                gameManager.on('level-fail', this.onLevelFail, this);
            }
        }, 0);
    }

    private removeEventListeners(): void {
        const gameManager = GameManager.instance;
        if (gameManager) {
            gameManager.off('level-complete', this.onLevelComplete, this);
            gameManager.off('level-fail', this.onLevelFail, this);
        }
    }

    private onLevelComplete = async (data?: any) => {
        if (!this.autoSaveOnComplete) return;

        // 获取当前关卡ID
        const gameManager = GameManager.instance;
        if (!gameManager) return;

        const levelId = (gameManager as any).currentLevelId;
        if (!levelId) return;

        // 获取分数数据
        const scoreSystem = gameManager.getScoreSystem();
        if (!scoreSystem) return;

        const scoreData = scoreSystem.getScoreData();
        this.completeLevel(levelId, {
            score: scoreSystem.getTotalScore(),
            kills: scoreData.kills,
            combo: scoreData.maxCombo,
            time: scoreData.timeElapsed,
        });
    };

    private onLevelFail = async (data?: any) => {
        if (!this.autoSaveOnFail) return;

        // 获取当前关卡ID
        const gameManager = GameManager.instance;
        if (!gameManager) return;

        const levelId = (gameManager as any).currentLevelId;
        if (!levelId) return;

        // 获取分数数据并更新最高分
        const scoreSystem = gameManager.getScoreSystem();
        if (scoreSystem) {
            const scoreData = scoreSystem.getScoreData();
            this.updateLevelBestScore(levelId, {
                score: scoreSystem.getTotalScore(),
                kills: scoreData.kills,
                combo: scoreData.maxCombo,
            });
        }
    };
}


