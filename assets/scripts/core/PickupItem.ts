import { _decorator, Component, Node, Collider2D, Contact2DType, IPhysics2DContact } from 'cc';
import { ObjectPool } from './ObjectPool';
import { CollisionLayer, CollisionHelper } from './CollisionLayers';
const { ccclass, property } = _decorator;

export interface Pickupable {
	/** 拾取物类型标识 */
	getPickupType(): string;
	/** 执行拾取效果，返回是否成功 */
	onPickup(collector: Node): boolean;
	/** 获取拾取物的节点 */
	getPickupNode(): Node;
}

export function isPickupable(obj: any): obj is Pickupable {
	return !!obj && typeof obj.getPickupType === 'function' && typeof obj.onPickup === 'function' && typeof obj.getPickupNode === 'function';
}

@ccclass('PickupItem')
export class PickupItem extends Component implements Pickupable {
	@property({ tooltip: '拾取物类型标识' })
	pickupType: string = 'item';

	@property({ tooltip: '拾取后自动回收（对象池）' })
	autoRecycleOnPickup: boolean = true;

	@property({ tooltip: '回收宿主（有则回收到池，否则销毁）' })
	poolHost: ObjectPool | null = null;

	@property({ tooltip: '拾取范围半径（像素），<=0 表示使用碰撞体' })
	pickupRadius: number = 0;

	private _col2d: Collider2D | null = null;
	private _pickedUp: boolean = false;

	onEnable() {
		this._pickedUp = false;
		this.setupCollisionLayer();
		this.attachCollider();
	}

	private setupCollisionLayer() {
		CollisionHelper.setCollisionLayer(this.node, CollisionLayer.Pickup);
	}

	onDisable() {
		this.detachCollider();
	}

	// ========== Pickupable 接口实现 ==========
	getPickupType(): string { return this.pickupType; }
	getPickupNode(): Node { return this.node; }
	onPickup(collector: Node): boolean {
		if (this._pickedUp) return false;
		this._pickedUp = true;
		const success = this.onPickupInternal(collector);
		if (success) {
			// 触发拾取事件（如果收集者有事件系统）
			const player = this.findComponentInNodeOrParent(collector, 'PlayerActor');
			if (player && typeof (player as any).on === 'function') {
				// 通过公开的事件接口触发
				(player as any).on('pickup', () => {}, player);
				// 直接触发事件（如果支持）
				if ((player as any).eventBus && typeof (player as any).eventBus.emit === 'function') {
					(player as any).eventBus.emit('pickup', { type: this.getPickupType(), item: this });
				}
			}
			if (this.autoRecycleOnPickup) {
				this.recycle();
			}
		}
		return success;
	}

	// ========== 子类覆盖：具体拾取效果 ==========
	protected onPickupInternal(collector: Node): boolean {
		// 子类覆盖实现具体效果
		return true;
	}

	// ========== 碰撞处理 ==========
	private attachCollider() {
		this._col2d = this.getComponent(Collider2D);
		if (this._col2d) {
			this._col2d.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact2D, this);
		}
	}

	private detachCollider() {
		if (this._col2d) {
			this._col2d.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact2D, this);
			this._col2d = null;
		}
	}

	private onBeginContact2D(self: Collider2D, other: Collider2D, contact: IPhysics2DContact | null) {
		// 检测是否与玩家碰撞
		const player = this.findComponentInNodeOrParent(other.node, 'PlayerActor');
		if (player) {
			this.onPickup(other.node);
		}
	}

	private findComponentInNodeOrParent(node: Node, componentName: string): Component | null {
		let cur: Node | null = node;
		while (cur) {
			const comps = cur.components;
			for (const c of comps) {
				if (c.constructor.name === componentName) return c;
			}
			cur = cur.parent;
		}
		return null;
	}

	// ========== 手动触发拾取（用于距离检测等） ==========
	public tryPickup(collector: Node): boolean {
		if (this.pickupRadius <= 0) return false;
		const distance = this.node.worldPosition.subtract(collector.worldPosition).length();
		if (distance <= this.pickupRadius) {
			return this.onPickup(collector);
		}
		return false;
	}

	// ========== 回收 ==========
	recycle() {
		if (this.poolHost && this.poolHost.isValid) {
			this.poolHost.release(this.node);
		} else if (this.node.isValid) {
			this.node.destroy();
		}
	}
}

