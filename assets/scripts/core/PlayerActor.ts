import { _decorator, Component, Node, Vec3, EventTarget, instantiate, TextAsset } from 'cc';
import { ResourceManager } from '../resource/ResourceManager';
const { ccclass, property } = _decorator;

export enum PlayerState {
    Idle = 'Idle',
    Alive = 'Alive',
    Dead = 'Dead',
}

@ccclass('PlayerActor')
export class PlayerActor extends Component {
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

    private state: PlayerState = PlayerState.Idle;
    private hp: number = 1;
    private eventBus: EventTarget = new EventTarget();

    // 移动相关
    private moveDir: Vec3 = new Vec3();
    private boundsMin: Vec3 | null = null;
    private boundsMax: Vec3 | null = null;

    // 攻击/技能相关
    private fireElapsed: number = 0;
    private isFiring: boolean = false;
    private lastHitTime: number = -9999;
    private lastSkillTime: number = -9999;

    onLoad() {
        this.hp = this.maxHp;
        this.state = PlayerState.Alive;
    }

    start() {
    }

    update(deltaTime: number) {
        if (this.state !== PlayerState.Alive) return;
        this.updateMovement(deltaTime);
        this.updateAttack(deltaTime);
    }

    // ========== 对外事件订阅 ==========
    on(event: 'hit' | 'die' | 'heal' | 'fire' | 'skill', cb: (data?: any) => void, target?: any) {
        this.eventBus.on(event, cb, target);
    }
    off(event: 'hit' | 'die' | 'heal' | 'fire' | 'skill', cb: (data?: any) => void, target?: any) {
        this.eventBus.off(event, cb, target);
    }

    // ========== 状态/属性 ==========
    getState() { return this.state; }
    getHp() { return this.hp; }
    getMaxHp() { return this.maxHp; }

    revive(newHp?: number) {
        this.hp = Math.min(newHp ?? this.maxHp, this.maxHp);
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
    startFire() { this.isFiring = true; }
    stopFire() { this.isFiring = false; }

    attackOnce() {
        this.spawnBullet().catch(() => {});
    }

    private updateAttack(dt: number) {
        this.fireElapsed += dt;
        if (!this.isFiring) return;
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
        return (now - this.lastHitTime) < this.invulnerableDuration;
    }

    takeDamage(amount: number, now: number) {
        if (this.state !== PlayerState.Alive) return;
        if (amount <= 0) return;
        if (this.isInvulnerable(now)) return;
        this.lastHitTime = now;
        this.hp = Math.max(0, this.hp - amount);
        this.eventBus.emit('hit', { amount, hp: this.hp });
        if (this.hp <= 0) {
            this.die();
        }
    }

    heal(amount: number) {
        if (amount <= 0) return;
        const prev = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        if (this.hp !== prev) this.eventBus.emit('heal', { amount, hp: this.hp });
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


