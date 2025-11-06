import { _decorator, Component, Node, Vec3, EventTarget } from 'cc';
import type { DamageContext } from './DamageDealer';
import type { Damageable } from './Damageable';
import { ObjectPool } from './ObjectPool';
import { HealthComponent } from './HealthComponent';
import { DropSystem } from '../utils/DropSystem';
import { EnemyType } from '../level/LevelData';
import { CollisionLayer, CollisionHelper, CollisionManager } from './CollisionLayers';
import { Collider2D, Contact2DType, IPhysics2DContact } from 'cc';
import { DamageDealer, DamageFaction } from './DamageDealer';
const { ccclass, property } = _decorator;

@ccclass('EnemyBase')
export class EnemyBase extends Component implements Damageable {
    @property
    maxHp: number = 30;

    @property
    moveSpeed: number = 200;

	@property({ tooltip: '与玩家/子弹接触造成的伤害（若采用碰撞伤害）' })
	contactDamage: number = 10;

	@property({ tooltip: '击杀得分' })
	killScore: number = 10;

	@property({ tooltip: '敌人类型（用于掉落表匹配）' })
	enemyType: EnemyType = EnemyType.Fighter;

	@property({ tooltip: '是否为Boss（Boss掉落固定）' })
	isBoss: boolean = false;

	@property({ tooltip: '死亡后自动回收到对象池' })
	autoRecycleOnDie: boolean = true;

	@property(DropSystem)
	dropSystem: DropSystem | null = null;

    @property(ObjectPool)
    poolHost: ObjectPool | null = null;

    private eventBus: EventTarget = new EventTarget();
    @property(HealthComponent)
    health: HealthComponent | null = null;

    // 碰撞相关
    private _col2d: Collider2D | null = null;
    private _lastContactTime: number = -9999;
    private _contactCooldown: number = 0.5; // 碰撞伤害冷却（秒）

    // 运动/AI辅助
    protected velocity: Vec3 = new Vec3();
    protected moveDir: Vec3 = new Vec3(0, -1, 0);
    protected target: Node | null = null;

    onEnable() {
        if (!this.health) this.health = this.getComponent(HealthComponent);
        if (this.health) {
            this.health.maxHp = this.maxHp;
            this.health.revive(this.maxHp);
            this.health.on('hit', (data) => { this.onHit(data?.amount, data?.source); this.eventBus.emit('hit', data); }, this);
            this.health.on('die', (data) => { this.onDie(data?.source); this.eventBus.emit('die', { source: data?.source }); if (this.autoRecycleOnDie) this.recycle(); }, this);
        }
        this.setupCollisionLayer();
        this.attachCollider();
        this.onSpawn();
        this.eventBus.emit('spawn');
    }

    private setupCollisionLayer() {
        CollisionHelper.setCollisionLayer(this.node, CollisionLayer.Enemy);
    }

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
        // 验证碰撞层
        const otherLayer = CollisionHelper.getCollisionLayer(other.node);
        if (otherLayer === null) return;

        // 检查是否可以碰撞
        if (!CollisionManager.canCollide(CollisionLayer.Enemy, otherLayer)) {
            return;
        }

        // 处理与玩家的碰撞伤害
        if (otherLayer === CollisionLayer.Player) {
            const now = performance.now() / 1000;
            if (this.contactDamage > 0 && (now - this._lastContactTime) >= this._contactCooldown) {
                this._lastContactTime = now;
                DamageDealer.dealDamage(other.node, this.contactDamage, {
                    source: this,
                    faction: DamageFaction.Enemy,
                    now: now,
                });
            }
        }
    }

    onDisable() {
        this.detachCollider();
        this.onDespawn();
        this.eventBus.emit('despawn');
    }

    update(deltaTime: number) {
        if (!(this.health && this.health.isAlive())) return;
        this.updateAI(deltaTime);
        this.updateMovement(deltaTime);
    }

    // ========== 事件订阅 ==========
    on(event: 'spawn' | 'hit' | 'die' | 'despawn', cb: (data?: any) => void, target?: any) {
        this.eventBus.on(event, cb, target);
    }
    off(event: 'spawn' | 'hit' | 'die' | 'despawn', cb: (data?: any) => void, target?: any) {
        this.eventBus.off(event, cb, target);
    }

    // ========== 生命/受击 ==========
    getHp() { return this.health ? this.health.getHp() : 0; }
    isAlive() { return !!(this.health && this.health.isAlive()); }

    revive(hp?: number) {
        if (!this.health) this.health = this.getComponent(HealthComponent);
        if (this.health) this.health.revive(hp ?? this.maxHp);
    }

    takeDamage(amount: number, source?: any) {
        if (!this.health) return;
        this.health.takeDamageRaw(amount, source);
    }

	protected die(source?: any) {
		// 触发掉落
		this.triggerDrops(source);

		// 兼容保留：现在由 HealthComponent 触发 die 流程
		if (this.autoRecycleOnDie) this.recycle();
		this.onDie(source);
		this.eventBus.emit('die', { source });
	}

	/**
	 * 触发掉落
	 */
	private async triggerDrops(source?: any): Promise<void> {
		// 查找DropSystem
		let dropSys = this.dropSystem;
		if (!dropSys) {
			// 尝试从场景中查找
			let cur: Node | null = this.node.parent;
			while (cur && !dropSys) {
				dropSys = cur.getComponent(DropSystem);
				cur = cur.parent;
			}
		}

		if (dropSys) {
			const position = this.node.worldPosition.clone();
			await dropSys.dropItems(position, null, this.isBoss, this.enemyType);
		}
	}

    recycle() {
        if (this.poolHost && this.poolHost.isValid) {
            this.poolHost.release(this.node);
        } else if (this.node.isValid) {
            this.node.destroy();
        }
    }

    // ========== 运动/AI ==========
    setTarget(node: Node | null) { this.target = node; }
    setMoveDirection(x: number, y: number) { this.moveDir.set(x, y, 0); }

    protected updateAI(dt: number) {
        // 子类覆盖：寻找玩家、开火、切换阶段等
    }

    protected updateMovement(dt: number) {
        if (this.moveDir.lengthSqr() === 0 && this.velocity.lengthSqr() === 0) return;
        const pos = this.node.worldPosition.clone();
        if (this.moveDir.lengthSqr() > 0) {
            const step = this.moveDir.clone();
            step.normalize();
            step.multiplyScalar(this.moveSpeed * dt);
            pos.add(step);
        }
        pos.add(this.velocity.clone().multiplyScalar(dt));
        this.node.setWorldPosition(pos);
    }

    // ========== 钩子：供子类复写 ==========
    protected onSpawn() {}
    protected onDespawn() {}
    protected onHit(amount: number, source?: any) {}
    protected onDie(source?: any) {}

    // ========== Damageable 接口实现 ==========
    isDamageableAlive(): boolean { return this.isAlive(); }
    takeDamageByDealer(amount: number, ctx: DamageContext): void { this.takeDamage(amount, ctx?.source); }
    getDamageableNode(): Node { return this.node; }
}


