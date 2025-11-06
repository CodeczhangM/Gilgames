import { _decorator, Component, Node, Prefab, instantiate, Vec3, Camera, UITransform, view, UIOpacity, tween, Label } from 'cc';
import { DamageNumber, DamageShowOptions } from './DamageNumber';
import { FloatingText, FloatingTextOptions } from './FloatingText';
const { ccclass, property } = _decorator;

// 扩展选项接口，添加管理器级别的控制
export interface ManagerShowOptions {
	useDefaultAnimation?: boolean; // 是否使用默认上移+渐出动画
	displayDuration?: number; // 自定义显示时长（秒，最长5秒，仅在非默认模式下生效）
}

/**
 * 浮动文本管理器（统一管理伤害数字和提示文本）
 * 建议挂载位置：
 * 1. 挂载到 UI Canvas 根节点下的一个子节点（如 "FloatingTextContainer"）
 * 2. 或者挂载到场景根节点，但需要确保有 UITransform 组件
 * 
 * 使用方式：
 * - 在场景中创建一个空节点，命名为 "FloatingTextContainer"
 * - 添加 UITransform 组件（确保是 UI 节点）
 * - 挂载 DamageNumberManager 组件
 * - 将 DamageNumber 和 FloatingText 预制体分别拖拽到对应属性
 */
@ccclass('DamageNumberManager')
export class DamageNumberManager extends Component {
	private static _instance: DamageNumberManager | null = null;
	public static get instance(): DamageNumberManager | null { return this._instance; }

	@property({ type: Prefab, tooltip: 'DamageNumber 预制体（必须包含 DamageNumber 组件）' })
	damagePrefab: Prefab | null = null;

	@property({ type: Prefab, tooltip: 'FloatingText 预制体（必须包含 FloatingText 组件）' })
	floatingTextPrefab: Prefab | null = null;

	@property({ tooltip: '最大同时存在的浮动文本数量（超过时复用最早的）' })
	maxPoolSize: number = 30;

	@property({ tooltip: '是否使用对象池（推荐）' })
	usePool: boolean = true;

	@property({ type: Camera, tooltip: '世界相机（用于世界坐标转UI坐标，可选）' })
	worldCamera: Camera | null = null;

	@property({ tooltip: '默认使用上移+渐出动画（true=默认动画，false=静态显示+渐出）' })
	useDefaultAnimation: boolean = true;

	@property({ tooltip: '非默认模式下的显示时长（秒，最长5秒）' })
	displayDuration: number = 2.0;

	// 对象池：分别管理两种类型
	private damagePool: Node[] = [];
	private floatingTextPool: Node[] = [];
	private activeNodes: Node[] = [];

	onLoad() {
		DamageNumberManager._instance = this;
		if (!this.damagePrefab && !this.floatingTextPrefab) {
			console.warn('[DamageNumberManager] 未设置任何预制体，请至少设置一个');
		}
		// 确保节点有 UITransform（UI 节点）
		if (!this.getComponent(UITransform)) {
			console.warn('[DamageNumberManager] 建议将此组件挂载到 UI 节点（有 UITransform）');
		}
	}

	onDestroy() {
		if (DamageNumberManager._instance === this) {
			DamageNumberManager._instance = null;
		}
	}

	// ==================== 伤害数字相关方法 ====================

	/**
	 * 显示伤害数字（世界坐标）
	 * @param value 伤害值
	 * @param worldPos 世界坐标位置
	 * @param options 显示选项
	 * @param managerOptions 管理器选项（控制动画行为）
	 */
	showDamageAtWorldPosition(
		value: number | string, 
		worldPos: Vec3, 
		options: DamageShowOptions = {},
		managerOptions: ManagerShowOptions = {}
	): void {
		if (!this.damagePrefab) {
			console.warn('[DamageNumberManager] 未设置 damagePrefab');
			return;
		}

		// 将世界坐标转换为 UI 坐标
		const uiPos = this.worldToUIPosition(worldPos);
		if (!uiPos) {
			console.warn('[DamageNumberManager] 无法转换世界坐标到 UI 坐标');
			return;
		}

		this.showDamageAtUIPosition(value, uiPos, options, managerOptions);
	}

	/**
	 * 显示伤害数字（UI 坐标）
	 * @param value 伤害值
	 * @param uiPos UI 坐标位置
	 * @param options 显示选项
	 * @param managerOptions 管理器选项（控制动画行为）
	 */
	showDamageAtUIPosition(
		value: number | string, 
		uiPos: Vec3, 
		options: DamageShowOptions = {},
		managerOptions: ManagerShowOptions = {}
	): void {
		if (!this.damagePrefab) {
			console.warn('[DamageNumberManager] 未设置 damagePrefab');
			return;
		}

		const node = this.getOrCreateDamageNode();
		if (!node) return;

		node.setPosition(uiPos);
		const comp = node.getComponent(DamageNumber);
		if (!comp) return;

		// 判断是否使用默认动画
		const useDefault = managerOptions.useDefaultAnimation ?? this.useDefaultAnimation;
		
		if (useDefault) {
			// 使用默认动画（上移+渐出）
			options.startPos = uiPos.clone();
			comp.show(value, options);
		} else {
			// 使用静态显示+渐出
			this.showStaticDamage(value, node, comp, uiPos, options, managerOptions);
		}
	}

	/**
	 * 显示伤害数字（相对于管理器的本地坐标）
	 * @param value 伤害值
	 * @param localPos 本地坐标位置
	 * @param options 显示选项
	 * @param managerOptions 管理器选项（控制动画行为）
	 */
	showDamageAtLocalPosition(
		value: number | string, 
		localPos: Vec3, 
		options: DamageShowOptions = {},
		managerOptions: ManagerShowOptions = {}
	): void {
		if (!this.damagePrefab) {
			console.warn('[DamageNumberManager] 未设置 damagePrefab');
			return;
		}

		const node = this.getOrCreateDamageNode();
		if (!node) return;

		node.setPosition(localPos);
		const comp = node.getComponent(DamageNumber);
		if (!comp) return;

		// 判断是否使用默认动画
		const useDefault = managerOptions.useDefaultAnimation ?? this.useDefaultAnimation;
		
		if (useDefault) {
			// 使用默认动画（上移+渐出）
			options.startPos = localPos.clone();
			comp.show(value, options);
		} else {
			// 使用静态显示+渐出
			this.showStaticDamage(value, node, comp, localPos, options, managerOptions);
		}
	}

	// ==================== 浮动文本相关方法 ====================

	/**
	 * 显示浮动文本（世界坐标）
	 * @param text 文本内容
	 * @param worldPos 世界坐标位置
	 * @param options 显示选项
	 * @param managerOptions 管理器选项（控制动画行为）
	 */
	showFloatingTextAtWorldPosition(
		text: string, 
		worldPos: Vec3, 
		options: FloatingTextOptions = {},
		managerOptions: ManagerShowOptions = {}
	): void {
		if (!this.floatingTextPrefab) {
			console.warn('[DamageNumberManager] 未设置 floatingTextPrefab');
			return;
		}

		// 将世界坐标转换为 UI 坐标
		const uiPos = this.worldToUIPosition(worldPos);
		if (!uiPos) {
			console.warn('[DamageNumberManager] 无法转换世界坐标到 UI 坐标');
			return;
		}

		this.showFloatingTextAtUIPosition(text, uiPos, options, managerOptions);
	}

	/**
	 * 显示浮动文本（UI 坐标）
	 * @param text 文本内容
	 * @param uiPos UI 坐标位置
	 * @param options 显示选项
	 * @param managerOptions 管理器选项（控制动画行为）
	 */
	showFloatingTextAtUIPosition(
		text: string, 
		uiPos: Vec3, 
		options: FloatingTextOptions = {},
		managerOptions: ManagerShowOptions = {}
	): void {
		if (!this.floatingTextPrefab) {
			console.warn('[DamageNumberManager] 未设置 floatingTextPrefab');
			return;
		}

		const node = this.getOrCreateFloatingTextNode();
		if (!node) return;

		node.setPosition(uiPos);
		const comp = node.getComponent(FloatingText);
		if (!comp) return;

		// 判断是否使用默认动画
		const useDefault = managerOptions.useDefaultAnimation ?? this.useDefaultAnimation;
		
		if (useDefault) {
			// 使用默认动画（上移+渐出）
			options.startPos = uiPos.clone();
			comp.show(text, options);
		} else {
			// 使用静态显示+渐出
			this.showStaticFloatingText(text, node, comp, uiPos, options, managerOptions);
		}
	}

	/**
	 * 显示浮动文本（相对于管理器的本地坐标）
	 * @param text 文本内容
	 * @param localPos 本地坐标位置
	 * @param options 显示选项
	 * @param managerOptions 管理器选项（控制动画行为）
	 */
	showFloatingTextAtLocalPosition(
		text: string, 
		localPos: Vec3, 
		options: FloatingTextOptions = {},
		managerOptions: ManagerShowOptions = {}
	): void {
		if (!this.floatingTextPrefab) {
			console.warn('[DamageNumberManager] 未设置 floatingTextPrefab');
			return;
		}

		const node = this.getOrCreateFloatingTextNode();
		if (!node) return;

		node.setPosition(localPos);
		const comp = node.getComponent(FloatingText);
		if (!comp) return;

		// 判断是否使用默认动画
		const useDefault = managerOptions.useDefaultAnimation ?? this.useDefaultAnimation;
		
		if (useDefault) {
			// 使用默认动画（上移+渐出）
			options.startPos = localPos.clone();
			comp.show(text, options);
		} else {
			// 使用静态显示+渐出
			this.showStaticFloatingText(text, node, comp, localPos, options, managerOptions);
		}
	}

	// ==================== 静态显示方法（非默认动画模式） ====================

	/**
	 * 静态显示伤害数字（不移动，只渐出）
	 */
	private showStaticDamage(
		value: number | string,
		node: Node,
		comp: DamageNumber,
		pos: Vec3,
		options: DamageShowOptions,
		managerOptions: ManagerShowOptions
	): void {
		const label = node.getComponent(Label);
		const opacity = node.getComponent(UIOpacity);
		
		if (!label || !opacity) return;

		// 设置文本和样式
		label.string = typeof value === 'number' ? Math.floor(value).toString() : String(value);
		const kind = options.kind ?? 'normal';
		// 获取颜色（通过反射访问私有方法，或使用公共接口）
		const normalColor = (comp as any).normalColor;
		const critColor = (comp as any).critColor;
		const healColor = (comp as any).healColor;
		let color = options.color;
		if (!color) {
			switch (kind) {
				case 'crit': color = critColor; break;
				case 'heal': color = healColor; break;
				default: color = normalColor;
			}
		}
		label.color = color;
		
		// 应用描边
		const useOutline = options.useOutline ?? (comp as any).useOutline;
		const outlineColor = options.outlineColor ?? (comp as any).outlineColor;
		const outlineWidth = (comp as any).outlineWidth ?? 2;
		label.enableOutline = !!useOutline;
		if (useOutline) {
			label.outlineColor = outlineColor;
			label.outlineWidth = outlineWidth;
		}
		
		// 设置位置和初始状态
		node.setPosition(pos);
		node.setScale(1, 1, 1);
		opacity.opacity = 255;

		// 计算显示时长（最长5秒）
		const displayDur = Math.min(
			Math.max(0.1, managerOptions.displayDuration ?? this.displayDuration),
			5.0
		);
		const fadeOutDur = 0.3; // 渐出时长

		// 等待显示时长后渐出
		tween(opacity)
			.delay(displayDur)
			.to(fadeOutDur, { opacity: 0 })
			.call(() => {
				if ((comp as any).autoRemove) {
					node.destroy();
				}
			})
			.start();
	}

	/**
	 * 静态显示浮动文本（不移动，只渐出）
	 */
	private showStaticFloatingText(
		text: string,
		node: Node,
		comp: FloatingText,
		pos: Vec3,
		options: FloatingTextOptions,
		managerOptions: ManagerShowOptions
	): void {
		const label = node.getComponent(Label);
		const opacity = node.getComponent(UIOpacity);
		
		if (!label || !opacity) return;

		// 设置文本和样式
		label.string = text;
		const kind = options.kind ?? 'info';
		// 获取颜色（通过反射访问私有方法，或使用公共接口）
		const pickupColor = (comp as any).pickupColor;
		const dropColor = (comp as any).dropColor;
		const infoColor = (comp as any).infoColor;
		const warningColor = (comp as any).warningColor;
		const goodColor = (comp as any).goodColor;
		const badColor = (comp as any).badColor;
		let color = options.color;
		if (!color) {
			switch (kind) {
				case 'pickup': color = pickupColor; break;
				case 'drop': color = dropColor; break;
				case 'warning': color = warningColor; break;
				case 'good': color = goodColor; break;
				case 'bad': color = badColor; break;
				default: color = infoColor;
			}
		}
		label.color = color;
		
		// 应用描边
		const useOutline = options.useOutline ?? (comp as any).useOutline;
		const outlineColor = options.outlineColor ?? (comp as any).outlineColor;
		const outlineWidth = (comp as any).outlineWidth ?? 2;
		label.enableOutline = !!useOutline;
		if (useOutline) {
			label.outlineColor = outlineColor;
			label.outlineWidth = outlineWidth;
		}
		
		// 设置位置和初始状态
		node.setPosition(pos);
		node.setScale(1, 1, 1);
		opacity.opacity = 255;

		// 计算显示时长（最长5秒）
		const displayDur = Math.min(
			Math.max(0.1, managerOptions.displayDuration ?? this.displayDuration),
			5.0
		);
		const fadeOutDur = 0.3; // 渐出时长

		// 等待显示时长后渐出
		tween(opacity)
			.delay(displayDur)
			.to(fadeOutDur, { opacity: 0 })
			.call(() => {
				if ((comp as any).autoRemove) {
					node.destroy();
				}
			})
			.start();
	}

	// ==================== 兼容旧 API（保持向后兼容） ====================

	/**
	 * @deprecated 使用 showDamageAtWorldPosition 代替
	 */
	showAtWorldPosition(value: number | string, worldPos: Vec3, options: DamageShowOptions = {}): void {
		this.showDamageAtWorldPosition(value, worldPos, options);
	}

	/**
	 * @deprecated 使用 showDamageAtUIPosition 代替
	 */
	showAtUIPosition(value: number | string, uiPos: Vec3, options: DamageShowOptions = {}): void {
		this.showDamageAtUIPosition(value, uiPos, options);
	}

	/**
	 * @deprecated 使用 showDamageAtLocalPosition 代替
	 */
	showAtLocalPosition(value: number | string, localPos: Vec3, options: DamageShowOptions = {}): void {
		this.showDamageAtLocalPosition(value, localPos, options);
	}

	/**
	 * 获取或创建伤害数字节点
	 */
	private getOrCreateDamageNode(): Node | null {
		if (!this.damagePrefab) return null;
		return this.getOrCreateNode(this.damagePrefab, this.damagePool);
	}

	/**
	 * 获取或创建浮动文本节点
	 */
	private getOrCreateFloatingTextNode(): Node | null {
		if (!this.floatingTextPrefab) return null;
		return this.getOrCreateNode(this.floatingTextPrefab, this.floatingTextPool);
	}

	/**
	 * 获取或创建节点（通用方法）
	 */
	private getOrCreateNode(prefab: Prefab, pool: Node[]): Node | null {
		if (!prefab) return null;

		let node: Node | null = null;

		if (this.usePool && pool.length > 0) {
			// 从对象池获取
			node = pool.pop()!;
			node.active = true;
		} else {
			// 创建新节点
			node = instantiate(prefab);
			this.node.addChild(node);

			// 监听节点销毁，回收到对象池
			node.once(Node.EventType.NODE_DESTROYED, () => {
				const index = this.activeNodes.indexOf(node!);
				if (index >= 0) {
					this.activeNodes.splice(index, 1);
				}
			});
		}

		if (node) {
			this.activeNodes.push(node);
			// 如果对象池超过最大数量，移除最早的节点
			if (this.activeNodes.length > this.maxPoolSize) {
				const oldest = this.activeNodes.shift();
				if (oldest) {
					oldest.destroy();
				}
			}
		}

		return node;
	}

	/**
	 * 将世界坐标转换为 UI 坐标
	 */
	private worldToUIPosition(worldPos: Vec3): Vec3 | null {
		const camera = this.worldCamera || this.findWorldCamera();
		if (!camera) {
			console.warn('[DamageNumberManager] 未找到世界相机，无法转换坐标');
			return null;
		}

		const uiTransform = this.getComponent(UITransform);
		if (!uiTransform) {
			console.warn('[DamageNumberManager] 节点缺少 UITransform 组件');
			return null;
		}

		// 将世界坐标转换为屏幕坐标
		const screenPos = camera.worldToScreen(worldPos);
		
		// 将屏幕坐标转换为 UI 坐标
		// 屏幕坐标原点在左下角，需要转换为 UI 坐标系统
		const uiPos = new Vec3();
		uiTransform.convertToNodeSpaceAR(
			new Vec3(screenPos.x, screenPos.y, 0),
			uiPos
		);

		return uiPos;
	}

	/**
	 * 查找场景中的世界相机
	 */
	private findWorldCamera(): Camera | null {
		// 尝试从场景中查找主相机
		const scene = this.node.scene;
		if (!scene) return null;

		const cameras = scene.getComponentsInChildren(Camera);
		for (const cam of cameras) {
			// 优先返回激活的相机
			if (cam.node.active) {
				return cam;
			}
		}
		return cameras.length > 0 ? cameras[0] : null;
	}

	/**
	 * 清空对象池
	 */
	clearPool(): void {
		this.damagePool.forEach(node => node.destroy());
		this.damagePool.length = 0;
		this.floatingTextPool.forEach(node => node.destroy());
		this.floatingTextPool.length = 0;
		this.activeNodes.forEach(node => node.destroy());
		this.activeNodes.length = 0;
	}
}

