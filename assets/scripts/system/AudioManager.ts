import { _decorator, Component, AudioSource, AudioClip, Node, EventTarget } from 'cc';
import { ResourceManager } from '../resource/ResourceManager';
import { SettingConfig } from './SettingConfig';
import { GameManager } from '../GameManager';
const { ccclass, property } = _decorator;

export interface PlaySfxOptions {
	volume?: number; // 0~1（会叠乘 master 与 sfxVolume）
	loop?: boolean;
}

@ccclass('AudioManager')
export class AudioManager extends Component {
	private static _instance: AudioManager | null = null;
	public static get instance(): AudioManager | null { return this._instance; }

	@property({ tooltip: '最大同时播放的 SFX 数量（超过时复用最早的）' })
	maxSfxSources: number = 12;

	@property({ tooltip: '默认 BGM 资源（可选）' })
	defaultBgmPath: string = '';

	private eventBus: EventTarget = new EventTarget();
	private bgmSource: AudioSource | null = null;
	private sfxPool: AudioSource[] = [];
	private sfxIndex: number = 0;

	onLoad() {
		AudioManager._instance = this;
		this.ensureAudioSources();
		this.bindSettingConfig();
		this.bindGameManagerEvents();
	}

	onDestroy() {
		if (AudioManager._instance === this) AudioManager._instance = null;
		this.unbindSettingConfig();
		this.unbindGameManagerEvents();
	}

	// ================= 初始化与绑定 =================
	private ensureAudioSources() {
		// BGM
		this.bgmSource = this.node.getComponent(AudioSource) || this.node.addComponent(AudioSource);
		this.bgmSource.playOnAwake = false;
		this.bgmSource.loop = true;
		// SFX 池
		this.sfxPool.length = 0;
		for (let i = 0; i < this.maxSfxSources; i++) {
			const n = new Node(`SFX_${i}`);
			this.node.addChild(n);
			const src = n.addComponent(AudioSource);
			src.playOnAwake = false;
			src.loop = false;
			this.sfxPool.push(src);
		}
		this.applyVolumesFromSettings();
	}

	private bindSettingConfig() {
		const sc = SettingConfig.instance;
		if (!sc) return;
		sc.on('volumeChanged', this.onVolumeChanged, this);
		sc.on('settingsChanged', this.onVolumeChanged, this);
	}

	private unbindSettingConfig() {
		const sc = SettingConfig.instance;
		if (!sc) return;
		sc.off('volumeChanged', this.onVolumeChanged, this);
		sc.off('settingsChanged', this.onVolumeChanged, this);
	}

	private bindGameManagerEvents() {
		const gm = GameManager.instance;
		if (!gm) return;
		gm.on('level-complete', this.onLevelComplete, this);
		gm.on('level-fail', this.onLevelFail, this);
	}

	private unbindGameManagerEvents() {
		const gm = GameManager.instance;
		if (!gm) return;
		gm.off('level-complete', this.onLevelComplete, this);
		gm.off('level-fail', this.onLevelFail, this);
	}

	// ================= 事件处理 =================
	private onVolumeChanged = () => {
		this.applyVolumesFromSettings();
	};

	private onLevelComplete = async () => {
		// 关卡完成时可淡出当前 BGM
		await this.fadeOutBgm(0.6);
	};

	private onLevelFail = async () => {
		// 关卡失败时可淡出并播放失败音效（如有）
		await this.fadeOutBgm(0.4);
	};

	// ================= 音量控制 =================
	private getMaster(): number {
		return SettingConfig.instance?.getMasterVolume() ?? 1;
	}
	private getMusic(): number {
		return SettingConfig.instance?.getMusicVolume() ?? 1;
	}
	private getSfx(): number {
		return SettingConfig.instance?.getSfxVolume() ?? 1;
	}

	private applyVolumesFromSettings() {
		const master = this.getMaster();
		if (this.bgmSource) this.bgmSource.volume = master * this.getMusic();
		for (const s of this.sfxPool) s.volume = master * this.getSfx();
	}

	// ================= BGM =================
	async playBgm(path: string, { loop = true, fade = 0.3 }: { loop?: boolean; fade?: number } = {}) {
		if (!this.bgmSource) return;
		try {
			const clip = await ResourceManager.instance?.loadAudio(path);
			if (!clip) return;
			this.bgmSource.loop = loop;
			if (fade > 0 && this.bgmSource.playing) {
				await this.fadeOutBgm(fade);
			}
			this.bgmSource.clip = clip as AudioClip;
			this.bgmSource.currentTime = 0;
			this.applyVolumesFromSettings();
			this.bgmSource.play();
			if (fade > 0) await this.fadeInBgm(fade);
		} catch (e) {
			console.warn('[AudioManager] 播放 BGM 失败:', e);
		}
	}

	stopBgm() {
		if (!this.bgmSource) return;
		try { this.bgmSource.stop(); } catch {}
	}

	private async fadeInBgm(duration: number) {
		if (!this.bgmSource) return;
		const target = this.getMaster() * this.getMusic();
		const steps = 20;
		const dt = Math.max(0.01, duration / steps);
		for (let i = 1; i <= steps; i++) {
			const t = i / steps;
			this.bgmSource.volume = target * t;
			await this.delay(dt);
		}
		this.bgmSource.volume = target;
	}

	private async fadeOutBgm(duration: number) {
		if (!this.bgmSource) return;
		const start = this.bgmSource.volume;
		const steps = 20;
		const dt = Math.max(0.01, duration / steps);
		for (let i = steps - 1; i >= 0; i--) {
			const t = i / steps;
			this.bgmSource.volume = start * t;
			await this.delay(dt);
		}
		this.bgmSource.stop();
		this.applyVolumesFromSettings();
	}

	// ================= SFX =================
	async playSfx(path: string, options: PlaySfxOptions = {}): Promise<AudioSource | null> {
		const src = this.borrowSfxSource();
		if (!src) return null;
		try {
			const clip = await ResourceManager.instance?.loadAudio(path);
			if (!clip) return null;
			src.clip = clip as AudioClip;
			src.loop = !!options.loop;
			const base = this.getMaster() * this.getSfx();
			src.volume = base * (typeof options.volume === 'number' ? Math.max(0, Math.min(1, options.volume)) : 1);
			src.currentTime = 0;
			src.play();
			return src;
		} catch (e) {
			console.warn('[AudioManager] 播放 SFX 失败:', e);
			return null;
		}
	}

	private borrowSfxSource(): AudioSource | null {
		if (this.sfxPool.length === 0) return null;
		// 寻找空闲渠道；若无，循环复用
		for (let i = 0; i < this.sfxPool.length; i++) {
			const s = this.sfxPool[i];
			if (!s.playing) return s;
		}
		this.sfxIndex = (this.sfxIndex + 1) % this.sfxPool.length;
		return this.sfxPool[this.sfxIndex];
	}

	// ================= 工具 =================
	private delay(sec: number) {
		return new Promise<void>(resolve => setTimeout(resolve, sec * 1000));
	}
}
