import { _decorator, Component, Label, Color, UIOpacity, tween, Vec3, v3, Font } from 'cc';
const { ccclass, property } = _decorator;

export type HintKind = 'pickup' | 'drop' | 'info' | 'warning' | 'good' | 'bad';

export interface FloatingTextOptions {
	kind?: HintKind;
	color?: Color;
	outlineColor?: Color;
	useOutline?: boolean;
	startPos?: Vec3;
	duration?: number;
	riseDistance?: number;
	startScale?: number;
	endScale?: number;
	jitter?: number; // 起点轻微随机抖动（像素）
}

@ccclass('FloatingText')
export class FloatingText extends Component {
	@property({ tooltip: '默认动画时长（秒）' })
	duration: number = 0.8;
	@property({ tooltip: '默认上浮距离（像素）' })
	riseDistance: number = 36;
	@property({ tooltip: '起始缩放' })
	startScale: number = 0.95;
	@property({ tooltip: '结束缩放' })
	endScale: number = 1.0;
	@property({ tooltip: '起点随机抖动（像素）' })
	jitter: number = 6;

	@property({ type: Font, tooltip: '自定义字体（BitmapFont/TTF）' })
	font: Font | null = null;
	@property({ tooltip: '若未设置 font 是否使用系统字体' })
	useSystemFont: boolean = true;

	@property({ tooltip: '拾取颜色' })
	pickupColor: Color = new Color(120, 255, 160, 255);
	@property({ tooltip: '掉落颜色' })
	dropColor: Color = new Color(255, 210, 120, 255);
	@property({ tooltip: '信息颜色' })
	infoColor: Color = new Color(220, 235, 255, 255);
	@property({ tooltip: '警告颜色' })
	warningColor: Color = new Color(255, 160, 100, 255);
	@property({ tooltip: '正面颜色' })
	goodColor: Color = new Color(140, 240, 255, 255);
	@property({ tooltip: '负面颜色' })
	badColor: Color = new Color(255, 110, 120, 255);

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

	show(text: string, options: FloatingTextOptions = {}) {
		if (!this.label || !this.opacity) return;
		const kind: HintKind = options.kind ?? 'info';
		const dur = options.duration ?? this.duration;
		const rise = options.riseDistance ?? this.riseDistance;
		const s0 = options.startScale ?? this.startScale;
		const s1 = options.endScale ?? this.endScale;
		const jitter = options.jitter ?? this.jitter;

		this.label.string = text;
		this.label.color = options.color ?? this.getColorByKind(kind);
		this.applyOutline(options.useOutline ?? this.useOutline, options.outlineColor ?? this.outlineColor, this.outlineWidth);

		// 起点 + 抖动
		const basePos = options.startPos ? options.startPos.clone() : this.node.position.clone();
		const jx = (Math.random() * 2 - 1) * jitter;
		const jy = (Math.random() * 2 - 1) * jitter;
		const startPos = v3(basePos.x + jx, basePos.y + jy, basePos.z);
		this.node.setPosition(startPos);
		this.node.setScale(s0, s0, 1);
		this.opacity.opacity = 255;

		const endPos = v3(startPos.x, startPos.y + rise, startPos.z);
		tween(this.node)
			.to(dur, { position: endPos, scale: v3(s1, s1, 1) })
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

	private getColorByKind(kind: HintKind): Color {
		switch (kind) {
			case 'pickup': return this.pickupColor;
			case 'drop': return this.dropColor;
			case 'warning': return this.warningColor;
			case 'good': return this.goodColor;
			case 'bad': return this.badColor;
			default: return this.infoColor;
		}
	}
}
