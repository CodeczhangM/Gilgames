import { _decorator, Component, EventTarget, sys, view, screen, ResolutionPolicy } from 'cc';
const { ccclass, property } = _decorator;

export interface SettingsData {
	// 显示
	width: number; // 设计分辨率宽
	height: number; // 设计分辨率高
	fullScreen: boolean;
	quality: 'low' | 'medium' | 'high';
	// 音量（0~1）
	masterVolume: number;
	musicVolume: number;
	sfxVolume: number;
	// 其他（可扩展）
	language?: string;
	version: string;
}

@ccclass('SettingConfig')
export class SettingConfig extends Component {
	private static _instance: SettingConfig | null = null;
	private static readonly SAVE_KEY = 'gilgames_settings';
	private static readonly VERSION = '1.0.0';

	private eventBus: EventTarget = new EventTarget();
	private settings: SettingsData;

	@property({ tooltip: '默认宽度（设计分辨率）' })
	defaultWidth: number = 1280;
	@property({ tooltip: '默认高度（设计分辨率）' })
	defaultHeight: number = 720;
	@property({ tooltip: '启动时自动应用设置' })
	autoApplyOnLoad: boolean = true;

	public static get instance(): SettingConfig | null { return this._instance; }

	onLoad() {
		SettingConfig._instance = this;
		this.settings = this.loadSettings();
		if (this.autoApplyOnLoad) {
			this.applyAll();
		}
	}

	onDestroy() {
		if (SettingConfig._instance === this) SettingConfig._instance = null;
	}

	// 事件
	on(event: 'settingsChanged' | 'volumeChanged' | 'resolutionChanged' | 'fullScreenChanged', cb: (data?: any) => void, target?: any) {
		this.eventBus.on(event, cb, target);
	}
	off(event: 'settingsChanged' | 'volumeChanged' | 'resolutionChanged' | 'fullScreenChanged', cb: (data?: any) => void, target?: any) {
		this.eventBus.off(event, cb, target);
	}

	// 读取/保存
	private loadSettings(): SettingsData {
		try {
			let json: string | null = null;
			if (sys.localStorage) json = sys.localStorage.getItem(SettingConfig.SAVE_KEY);
			else if (typeof localStorage !== 'undefined') json = localStorage.getItem(SettingConfig.SAVE_KEY);
			if (!json) return this.createDefaultSettings();
			const data = JSON.parse(json);
			return this.deserialize(data);
		} catch (e) {
			console.warn('[SettingConfig] 加载设置失败，使用默认值:', e);
			return this.createDefaultSettings();
		}
	}

	private saveSettings(): boolean {
		try {
			const json = JSON.stringify(this.serialize());
			if (sys.localStorage) sys.localStorage.setItem(SettingConfig.SAVE_KEY, json);
			else if (typeof localStorage !== 'undefined') localStorage.setItem(SettingConfig.SAVE_KEY, json);
			return true;
		} catch (e) {
			console.error('[SettingConfig] 保存设置失败:', e);
			return false;
		}
	}

	private createDefaultSettings(): SettingsData {
		return {
			width: this.defaultWidth,
			height: this.defaultHeight,
			fullScreen: false,
			quality: 'high',
			masterVolume: 1,
			musicVolume: 1,
			sfxVolume: 1,
			language: 'zh-CN',
			version: SettingConfig.VERSION,
		};
	}

	private serialize(): any {
		return { ...this.settings };
	}

	private deserialize(data: any): SettingsData {
		const q = ['low','medium','high'];
		const qValid = q.indexOf(data?.quality) >= 0 ? (data.quality as 'low'|'medium'|'high') : 'high';
		return {
			width: Number(data?.width ?? this.defaultWidth),
			height: Number(data?.height ?? this.defaultHeight),
			fullScreen: Boolean(data?.fullScreen ?? false),
			quality: qValid,
			masterVolume: this.clamp01(Number(data?.masterVolume ?? 1)),
			musicVolume: this.clamp01(Number(data?.musicVolume ?? 1)),
			sfxVolume: this.clamp01(Number(data?.sfxVolume ?? 1)),
			language: String(data?.language ?? 'zh-CN'),
			version: String(data?.version ?? SettingConfig.VERSION),
		};
	}

	private clamp01(v: number): number { return Math.max(0, Math.min(1, isFinite(v) ? v : 0)); }

	// 对外查询
	getSettings(): SettingsData { return { ...this.settings }; }
	getResolution(): { width: number; height: number } { return { width: this.settings.width, height: this.settings.height }; }
	isFullScreen(): boolean { return this.settings.fullScreen; }
	getMasterVolume(): number { return this.settings.masterVolume; }
	getMusicVolume(): number { return this.settings.musicVolume; }
	getSfxVolume(): number { return this.settings.sfxVolume; }
	getQuality(): SettingsData['quality'] { return this.settings.quality; }

	// 修改项（自动保存并发事件）
	setResolution(width: number, height: number, applyNow: boolean = true) {
		if (width <= 0 || height <= 0) return;
		this.settings.width = Math.floor(width);
		this.settings.height = Math.floor(height);
		this.saveSettings();
		if (applyNow) this.applyResolution();
		this.eventBus.emit('resolutionChanged', { width: this.settings.width, height: this.settings.height });
		this.eventBus.emit('settingsChanged', this.getSettings());
	}

	setFullScreen(full: boolean, applyNow: boolean = true) {
		this.settings.fullScreen = !!full;
		this.saveSettings();
		if (applyNow) this.applyFullScreen();
		this.eventBus.emit('fullScreenChanged', { fullScreen: this.settings.fullScreen });
		this.eventBus.emit('settingsChanged', this.getSettings());
	}

	setVolumes(params: { master?: number; music?: number; sfx?: number }, applyNow: boolean = true) {
		if (typeof params.master === 'number') this.settings.masterVolume = this.clamp01(params.master);
		if (typeof params.music === 'number') this.settings.musicVolume = this.clamp01(params.music);
		if (typeof params.sfx === 'number') this.settings.sfxVolume = this.clamp01(params.sfx);
		this.saveSettings();
		if (applyNow) this.applyVolumes();
		this.eventBus.emit('volumeChanged', { master: this.settings.masterVolume, music: this.settings.musicVolume, sfx: this.settings.sfxVolume });
		this.eventBus.emit('settingsChanged', this.getSettings());
	}

	setQuality(quality: SettingsData['quality']) {
		this.settings.quality = quality;
		this.saveSettings();
		// 这里可结合具体项目进行画质参数的应用
		this.eventBus.emit('settingsChanged', this.getSettings());
	}

	setLanguage(lang: string) {
		this.settings.language = lang;
		this.saveSettings();
		this.eventBus.emit('settingsChanged', this.getSettings());
	}

	// 应用到引擎
	applyResolution() {
		// 使用设计分辨率
		try {
			view.setDesignResolutionSize(this.settings.width, this.settings.height, ResolutionPolicy.NO_BORDER);
		} catch (e) {
			console.warn('[SettingConfig] 应用分辨率失败:', e);
		}
	}

	async applyFullScreen() {
		try {
			if (this.settings.fullScreen) {
				if (!screen.fullScreen()) await screen.requestFullScreen();
			} else {
				if (screen.fullScreen()) await screen.exitFullScreen();
			}
		} catch (e) {
			console.warn('[SettingConfig] 切换全屏失败:', e);
		}
	}

	applyVolumes() {
		// 这里仅负责广播，具体音量由音频管理器/各 AudioSource 订阅实现
		// 如果后续加入全局音频管理器，可在此直接设置全局音量
	}

	applyAll() {
		this.applyResolution();
		this.applyFullScreen();
		this.applyVolumes();
	}
}


