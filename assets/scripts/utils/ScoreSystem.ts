import { _decorator, Component, Node, EventTarget } from 'cc';
const { ccclass, property } = _decorator;

export interface ScoreData {
	totalScore: number; // 总积分
	currentCombo: number; // 当前连击数
	maxCombo: number; // 最大连击数
	kills: number; // 击杀数
	timeElapsed: number; // 游戏时长（秒）
	lastKillTime: number; // 上次击杀时间（秒）
}

export interface RankEntry {
	name: string; // 玩家名称
	score: number; // 分数
	date: number; // 时间戳
	kills: number; // 击杀数
	maxCombo: number; // 最大连击
}

@ccclass('ScoreSystem')
export class ScoreSystem extends Component {
	@property({ tooltip: '连击时间窗口（秒），超过此时间未击杀则连击中断' })
	comboWindow: number = 3;

	@property({ tooltip: '基础击杀得分' })
	baseKillScore: number = 10;

	@property({ tooltip: '连击倍率（每连击一级增加倍数）' })
	comboMultiplier: number = 0.1;

	@property({ tooltip: '最大连击倍率' })
	maxComboMultiplier: number = 5;

	@property({ tooltip: '排行榜最大条目数' })
	maxRankEntries: number = 100;

	private scoreData: ScoreData = {
		totalScore: 0,
		currentCombo: 0,
		maxCombo: 0,
		kills: 0,
		timeElapsed: 0,
		lastKillTime: 0,
	};

	private eventBus: EventTarget = new EventTarget();
	private rankKey: string = 'game_rank_list';

	onLoad() {
		this.reset();
	}

	start() {
		// 监听敌人死亡事件
		this.setupEventListeners();
	}

	update(deltaTime: number) {
		this.scoreData.timeElapsed += deltaTime;

		// 检查连击是否中断
		const now = this.scoreData.timeElapsed;
		if (this.scoreData.currentCombo > 0 && (now - this.scoreData.lastKillTime) > this.comboWindow) {
			this.resetCombo();
		}
	}

	// ========== 事件订阅 ==========
	on(event: 'scoreChange' | 'comboChange' | 'comboBreak' | 'kill', cb: (data?: any) => void, target?: any) {
		this.eventBus.on(event, cb, target);
	}
	off(event: 'scoreChange' | 'comboChange' | 'comboBreak' | 'kill', cb: (data?: any) => void, target?: any) {
		this.eventBus.off(event, cb, target);
	}

	// ========== 积分管理 ==========
	/**
	 * 添加击杀得分
	 * @param baseScore 基础分数（可选，默认使用 baseKillScore）
	 * @param enemyType 敌人类型（可选，用于扩展不同敌人分数）
	 */
	addKillScore(baseScore?: number, enemyType?: string): number {
		const base = baseScore ?? this.baseKillScore;
		const now = this.scoreData.timeElapsed;

		// 检查连击
		const timeSinceLastKill = now - this.scoreData.lastKillTime;
		if (timeSinceLastKill <= this.comboWindow && this.scoreData.lastKillTime > 0) {
			// 连击继续
			this.scoreData.currentCombo += 1;
		} else {
			// 新连击
			this.scoreData.currentCombo = 1;
		}

		// 更新最大连击
		if (this.scoreData.currentCombo > this.scoreData.maxCombo) {
			this.scoreData.maxCombo = this.scoreData.currentCombo;
		}

		// 计算连击倍率
		const comboBonus = Math.min(
			this.scoreData.currentCombo * this.comboMultiplier,
			this.maxComboMultiplier
		);
		const finalScore = Math.floor(base * (1 + comboBonus));

		// 更新数据
		this.scoreData.totalScore += finalScore;
		this.scoreData.kills += 1;
		this.scoreData.lastKillTime = now;

		// 触发事件
		this.eventBus.emit('kill', {
			score: finalScore,
			totalScore: this.scoreData.totalScore,
			combo: this.scoreData.currentCombo,
			enemyType,
		});
		this.eventBus.emit('scoreChange', {
			totalScore: this.scoreData.totalScore,
			delta: finalScore,
		});
		this.eventBus.emit('comboChange', {
			combo: this.scoreData.currentCombo,
			maxCombo: this.scoreData.maxCombo,
		});

		return finalScore;
	}

	/**
	 * 添加额外分数（如拾取道具、完成任务等）
	 */
	addBonusScore(amount: number, reason?: string) {
		if (amount <= 0) return;
		this.scoreData.totalScore += amount;
		this.eventBus.emit('scoreChange', {
			totalScore: this.scoreData.totalScore,
			delta: amount,
			reason,
		});
	}

	/**
	 * 重置连击
	 */
	private resetCombo() {
		if (this.scoreData.currentCombo > 0) {
			this.eventBus.emit('comboBreak', {
				combo: this.scoreData.currentCombo,
			});
			this.scoreData.currentCombo = 0;
		}
	}

	/**
	 * 重置所有数据
	 */
	reset() {
		this.scoreData = {
			totalScore: 0,
			currentCombo: 0,
			maxCombo: 0,
			kills: 0,
			timeElapsed: 0,
			lastKillTime: 0,
		};
		this.eventBus.emit('scoreChange', { totalScore: 0, delta: 0 });
		this.eventBus.emit('comboChange', { combo: 0, maxCombo: 0 });
	}

	// ========== 数据查询 ==========
	getTotalScore(): number { return this.scoreData.totalScore; }
	getCurrentCombo(): number { return this.scoreData.currentCombo; }
	getMaxCombo(): number { return this.scoreData.maxCombo; }
	getKills(): number { return this.scoreData.kills; }
	getTimeElapsed(): number { return this.scoreData.timeElapsed; }
	getScoreData(): ScoreData { return { ...this.scoreData }; }

	// ========== 排行榜管理 ==========
	/**
	 * 保存当前分数到排行榜
	 * @param playerName 玩家名称
	 */
	saveRank(playerName: string): boolean {
		const entry: RankEntry = {
			name: playerName,
			score: this.scoreData.totalScore,
			date: Date.now(),
			kills: this.scoreData.kills,
			maxCombo: this.scoreData.maxCombo,
		};

		const rankList = this.loadRank();
		rankList.push(entry);
		// 按分数降序排序
		rankList.sort((a, b) => b.score - a.score);
		// 保留前 N 条
		rankList.splice(this.maxRankEntries);

		try {
			const json = JSON.stringify(rankList);
			localStorage.setItem(this.rankKey, json);
			return true;
		} catch (e) {
			console.error('保存排行榜失败:', e);
			return false;
		}
	}

	/**
	 * 加载排行榜
	 */
	loadRank(): RankEntry[] {
		try {
			const json = localStorage.getItem(this.rankKey);
			if (!json) return [];
			const data = JSON.parse(json) as RankEntry[];
			return Array.isArray(data) ? data : [];
		} catch (e) {
			console.error('加载排行榜失败:', e);
			return [];
		}
	}

	/**
	 * 获取排行榜前 N 名
	 */
	getTopRank(limit: number = 10): RankEntry[] {
		const rankList = this.loadRank();
		return rankList.slice(0, Math.min(limit, rankList.length));
	}

	/**
	 * 获取当前分数在排行榜中的排名
	 */
	getRankPosition(): number {
		const rankList = this.loadRank();
		const currentScore = this.scoreData.totalScore;
		for (let i = 0; i < rankList.length; i++) {
			if (currentScore > rankList[i].score) {
				return i + 1;
			}
		}
		return rankList.length + 1;
	}

	/**
	 * 清空排行榜
	 */
	clearRank() {
		try {
			localStorage.removeItem(this.rankKey);
		} catch (e) {
			console.error('清空排行榜失败:', e);
		}
	}

	// ========== 事件监听设置 ==========
	private setupEventListeners() {
		// 监听敌人死亡事件（需要外部系统调用或通过事件总线）
		// 这里提供一个手动注册的方法，由外部系统调用
	}

	/**
	 * 格式化时间显示（秒转 MM:SS）
	 */
	formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
		const secsStr = secs < 10 ? `0${secs}` : `${secs}`;
		return `${minsStr}:${secsStr}`;
	}

	/**
	 * 格式化分数显示（添加千分位）
	 */
	formatScore(score: number): string {
		return score.toLocaleString('zh-CN');
	}

	/**
	 * 获取连击倍率文本
	 */
	getComboMultiplierText(): string {
		if (this.scoreData.currentCombo <= 1) return '';
		const multiplier = 1 + Math.min(
			this.scoreData.currentCombo * this.comboMultiplier,
			this.maxComboMultiplier
		);
		return `x${multiplier.toFixed(1)}`;
	}
}
