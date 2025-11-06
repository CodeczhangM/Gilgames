import { _decorator, Component, Node, Vec3, EventTarget, instantiate, TextAsset } from 'cc';
import type { Damageable } from './Damageable';
import type { DamageContext } from './DamageDealer';
import { ResourceManager } from '../resource/ResourceManager';
import { WeaponSystem } from './WeaponSystem';
import { HealthComponent } from './HealthComponent';
import { CollisionLayer, CollisionHelper, CollisionManager } from './CollisionLayers';
import { Collider2D, Contact2DType, IPhysics2DContact } from 'cc';
import { DamageDealer, DamageFaction } from './DamageDealer';
const { ccclass, property } = _decorator;

export enum PlayerState {
    Idle = 'Idle',
    Alive = 'Alive',
    Dead = 'Dead',
}

@ccclass('PlayerActor')
export class PlayerActor extends Component implements Damageable {
    @property
    maxHp: number = 100;

    @property
    moveSpeed: number = 600; // 像素/秒（按项目坐标系调整）

    @property
    fireInterval: number = 0.15; // 普通攻击间隔（秒）

    @property({ tooltip: 'resources 下的预制体路径，如: bullets/player_bullet' })
    bulletPrefabPath: string = '';

    @property
    invulnerableDuration: number = 0.5; // 受击后无敌帧（秒）

    @property
    skillCooldown: number = 5; // 技能冷却（秒）

    @property({ tooltip: 'resources 下的技能预制体路径，如: skills/missile_barrage' })
    skillPrefabPath: string = '';

    @property(Node)
    projectileRoot: Node | null = null; // 子弹父节点

    @property(WeaponSystem)
    weapon: WeaponSystem | null = null;

    @property({ tooltip: '与敌人/障碍物接触造成的伤害（若采用碰撞伤害）' })
    contactDamage: number = 0;

    private state: PlayerState = PlayerState.Idle;
    @property(HealthComponent)
    health: HealthComponent | null = null;
    private eventBus: EventTarget = new EventTarget();

    // 碰撞相关
    private _col2d: Collider2D | null = null;
    private _lastContactTime: number = -9999;
    private _contactCooldown: number = 0.3; // 碰撞伤害冷却（秒）

    // 移动相关
    private moveDir: Vec3 = new Vec3();
    private boundsMin: Vec3 | null = null;
    private boundsMax: Vec3 | null = null;

    // 攻击/技能相关
    private fireElapsed: number = 0;
    private isFiring: boolean = false;
    private lastSkillTime: number = -9999;

    onLoad() {
        if (!this.health) this.health = this.getComponent(HealthComponent);
        if (this.health) {
            this.health.maxHp = this.maxHp;
            this.health.invulnerableDuration = this.invulnerableDuration;
            this.health.revive(this.maxHp);
            this.health.on('die', () => { this.die(); }, this);
        }
        this.setupCollisionLayer();
        this.attachCollider();
        this.state = PlayerState.Alive;
    }

    private setupCollisionLayer() {
        CollisionHelper.setCollisionLayer(this.node, CollisionLayer.Player);
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
        if (this.state !== PlayerState.Alive) return;

        // 验证碰撞层
        const otherLayer = CollisionHelper.getCollisionLayer(other.node);
        if (otherLayer === null) return;

        // 检查是否可以碰撞
        if (!CollisionManager.canCollide(CollisionLayer.Player, otherLayer)) {
            return;
        }

        const now = performance.now() / 1000;

        // 处理与敌人的碰撞伤害（敌人对玩家造成伤害）
        if (otherLayer === CollisionLayer.Enemy) {
            // 伤害由敌人的碰撞处理逻辑处理，这里可以记录碰撞事件
            // 如果需要玩家对敌人造成碰撞伤害，可以在这里处理
            if (this.contactDamage > 0 && (now - this._lastContactTime) >= this._contactCooldown) {
                this._lastContactTime = now;
                DamageDealer.dealDamage(other.node, this.contactDamage, {
                    source: this,
                    faction: DamageFaction.Player,
                    now: now,
                });
            }
        }

        // 处理与障碍物的碰撞（可以造成伤害或阻挡）
        if (otherLayer === CollisionLayer.Obstacle) {
            // 障碍物碰撞处理（如果需要）
            // 可以在这里处理碰撞反馈、伤害等
        }
    }

    onDestroy() {
        this.detachCollider();
    }

    start() {
    }

    update(deltaTime: number) {
        if (this.state !== PlayerState.Alive) return;
        this.updateMovement(deltaTime);
        this.updateAttack(deltaTime);
    }

    // ========== 对外事件订阅 ==========
    on(event: 'hit' | 'die' | 'heal' | 'fire' | 'skill' | 'pickup', cb: (data?: any) => void, target?: any) {
        this.eventBus.on(event, cb, target);
    }
    off(event: 'hit' | 'die' | 'heal' | 'fire' | 'skill' | 'pickup', cb: (data?: any) => void, target?: any) {
        this.eventBus.off(event, cb, target);
    }

    // ========== 状态/属性 ==========
    getState() { return this.state; }
    getHp() { return this.health ? this.health.getHp() : 0; }
    getMaxHp() { return this.maxHp; }

    revive(newHp?: number) {
        if (this.health) this.health.revive(Math.min(newHp ?? this.maxHp, this.maxHp));
        this.state = PlayerState.Alive;
    }

    private die() {
        if (this.state === PlayerState.Dead) return;
        this.state = PlayerState.Dead;
        this.isFiring = false;
        this.eventBus.emit('die');
    }

    // ========== 移动 ==========
    setBounds(min?: Vec3, max?: Vec3) {
        this.boundsMin = min ?? null;
        this.boundsMax = max ?? null;
    }

    setMoveDirection(x: number, y: number) {
        this.moveDir.set(x, y, 0);
    }

    private updateMovement(dt: number) {
        if (this.moveDir.lengthSqr() === 0) return;
        const pos = this.node.worldPosition.clone();
        const step = new Vec3(this.moveDir.x, this.moveDir.y, 0);
        step.normalize();
        step.multiplyScalar(this.moveSpeed * dt);
        pos.add(step);

        // 边界限制（可选）
        if (this.boundsMin && this.boundsMax) {
            pos.x = Math.min(Math.max(pos.x, this.boundsMin.x), this.boundsMax.x);
            pos.y = Math.min(Math.max(pos.y, this.boundsMin.y), this.boundsMax.y);
        }
        this.node.setWorldPosition(pos);
    }

    // ========== 普通攻击 ==========
    startFire() { this.isFiring = true; if (this.weapon) this.weapon.startFire(); }
    stopFire() { this.isFiring = false; if (this.weapon) this.weapon.stopFire(); }

    attackOnce() {
        if (this.weapon) { this.weapon.fireOnce().catch(() => {}); return; }
        this.spawnBullet().catch(() => {});
    }

    private updateAttack(dt: number) {
        this.fireElapsed += dt;
        if (!this.isFiring) return;
        // 若使用 WeaponSystem，则交由其自身节流
        if (this.weapon) return;
        if (this.fireElapsed >= this.fireInterval) {
            this.fireElapsed = 0;
            this.spawnBullet().catch(() => {});
        }
    }

    private async spawnBullet() {
        if (!this.bulletPrefabPath) return;
        const rm = ResourceManager.instance;
        if (!rm) return;
        try {
            const prefab = await rm.loadPrefab(this.bulletPrefabPath);
            const node = instantiate(prefab);
            (this.projectileRoot ?? this.node.parent ?? this.node).addChild(node);
            node.setWorldPosition(this.node.worldPosition);
            this.eventBus.emit('fire', node);
        } catch (e) {
            // ignore
        }
    }

    // ========== 受击/无敌帧 ==========
    isInvulnerable(now: number): boolean {
        if (!this.health) return false;
        return this.health.isInvulnerable(now);
    }

    takeDamage(amount: number, now: number) {
        if (this.state !== PlayerState.Alive) return;
        if (!this.health) return;
        const prev = this.health.getHp();
        this.health.takeDamageRaw(amount, undefined, now);
        const cur = this.health.getHp();
        if (cur !== prev) this.eventBus.emit('hit', { amount, hp: cur });
        if (cur <= 0) this.die();
    }

    heal(amount: number) {
        if (amount <= 0) return;
        if (!this.health) return;
        const prev = this.health.getHp();
        this.health.heal(amount);
        const cur = this.health.getHp();
        if (cur !== prev) this.eventBus.emit('heal', { amount, hp: cur });
    }

    // ========== 技能 ==========
    canCastSkill(now: number): boolean {
        return (now - this.lastSkillTime) >= this.skillCooldown;
    }

    async castSkill(now: number) {
        if (!this.canCastSkill(now)) return;
        if (!this.skillPrefabPath) return;
        const rm = ResourceManager.instance;
        if (!rm) return;
        try {
            const prefab = await rm.loadPrefab(this.skillPrefabPath);
            const node = instantiate(prefab);
            (this.projectileRoot ?? this.node.parent ?? this.node).addChild(node);
            node.setWorldPosition(this.node.worldPosition);
            this.lastSkillTime = now;
            this.eventBus.emit('skill', node);
        } catch (e) {
            // ignore
        }
    }
}

// ========== Damageable 接口实现 ==========
export interface PlayerActor extends Damageable {}
PlayerActor.prototype.isDamageableAlive = function(): boolean {
    return this.getState() === 'Alive' as any;
};
PlayerActor.prototype.takeDamageByDealer = function(amount: number, ctx: DamageContext): void {
    const now = ctx?.now ?? performance.now() / 1000;
    this.takeDamage(amount, now);
};
PlayerActor.prototype.getDamageableNode = function(): Node {
    return this.node;
};


