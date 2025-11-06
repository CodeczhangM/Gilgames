import { _decorator, Component, Label, Color, UIOpacity, tween, Vec3, v3, Font } from 'cc';
const { ccclass, property } = _decorator;

export type DamageKind = 'normal' | 'crit' | 'heal';

export interface DamageShowOptions {
	kind?: DamageKind;
	color?: Color; // 覆盖颜色
	outlineColor?: Color; // 轮廓颜色（若启用）
	useOutline?: boolean;
	startPos?: Vec3; // 起始世界/本地坐标（由外部决定使用）
	duration?: number; // 动画时长（秒）
	riseDistance?: number; // 上浮距离（像素）
	startScale?: number;
	endScale?: number;
	critScale?: number; // 暴击额外缩放倍数
}

@ccclass('DamageNumber')
export class DamageNumber extends Component {
	@property({ tooltip: '默认动画时长（秒）' })
	duration: number = 0.6;
	@property({ tooltip: '默认上浮距离（像素）' })
	riseDistance: number = 40;
	@property({ tooltip: '起始缩放' })
	startScale: number = 0.8;
	@property({ tooltip: '结束缩放' })
	endScale: number = 1.0;
	@property({ tooltip: '暴击额外缩放倍数' })
	critScale: number = 1.25;

	@property({ type: Font, tooltip: '自定义字体（BitmapFont/TTF）' })
	font: Font | null = null;
	@property({ tooltip: '是否使用系统字体（若 font 为空时）' })
	useSystemFont: boolean = true;

	@property({ tooltip: '普通伤害颜色' })
	normalColor: Color = new Color(255, 230, 150, 255);
	@property({ tooltip: '暴击伤害颜色' })
	critColor: Color = new Color(255, 120, 80, 255);
	@property({ tooltip: '治疗颜色' })
	healColor: Color = new Color(100, 255, 120, 255);

	@property({ tooltip: '是否开启描边' })
	useOutline: boolean = true;
	@property({ tooltip: '描边颜色' })
	outlineColor: Color = new Color(30, 30, 30, 200);
	@property({ tooltip: '描边宽度（像素）' })
	outlineWidth: number = 2;

	@property({ tooltip: '播放完成后自动销毁' })
	autoRemove: boolean = true;

	private label: Label | null = null;
	private opacity: UIOpacity | null = null;

	onLoad() {
		this.label = this.getComponent(Label) || this.node.addComponent(Label);
		this.opacity = this.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
		this.applyFont();
		this.applyOutline(this.useOutline, this.outlineColor, this.outlineWidth);
	}

	/**
	 * 显示伤害数字
	 */
	show(value: number | string, options: DamageShowOptions = {}): void {
		if (!this.label || !this.opacity) return;
		const kind: DamageKind = options.kind ?? 'normal';
		const dur = options.duration ?? this.duration;
		const rise = options.riseDistance ?? this.riseDistance;
		const s0 = (options.startScale ?? this.startScale) * (kind === 'crit' ? (options.critScale ?? this.critScale) : 1);
		const s1 = (options.endScale ?? this.endScale) * (kind === 'crit' ? (options.critScale ?? this.critScale) : 1);

		// 文本
		this.label.string = typeof value === 'number' ? Math.floor(value).toString() : String(value);
		this.label.color = options.color ?? this.getColorByKind(kind);
		this.applyOutline(options.useOutline ?? this.useOutline, options.outlineColor ?? this.outlineColor, this.outlineWidth);

		// 位置与透明
		const startPos = options.startPos ? options.startPos.clone() : this.node.position.clone();
		this.node.setPosition(startPos);
		this.opacity.opacity = 255;
		this.node.setScale(s0, s0, 1);

		// 动画：上浮 + 淡出 + 缩放
		const endPos = v3(startPos.x, startPos.y + rise, startPos.z);
		tween(this.node)
			.to(dur, { position: endPos, scale: v3(s1, s1, 1) })
			.call(() => {})
			.start();

		tween(this.opacity)
			.to(dur, { opacity: 0 })
			.call(() => { if (this.autoRemove) this.node.destroy(); })
			.start();
	}

	setFont(font: Font | null, useSystemFontIfNull: boolean = true) {
		this.font = font;
		this.useSystemFont = useSystemFontIfNull;
		this.applyFont();
	}

	private applyFont() {
		if (!this.label) return;
		this.label.font = this.font || null;
		this.label.useSystemFont = this.font ? false : !!this.useSystemFont;
	}

	private applyOutline(enabled: boolean, color: Color, width: number) {
		if (!this.label) return;
		this.label.enableOutline = !!enabled;
		if (enabled) {
			this.label.outlineColor = color;
			this.label.outlineWidth = width;
		}
	}

	private getColorByKind(kind: DamageKind): Color {
		switch (kind) {
			case 'crit': return this.critColor;
			case 'heal': return this.healColor;
			default: return this.normalColor;
		}
	}
}
