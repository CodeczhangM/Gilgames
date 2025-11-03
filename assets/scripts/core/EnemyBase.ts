import { _decorator, Component, Node, Vec3, EventTarget } from 'cc';
import { ObjectPool } from './ObjectPool';
const { ccclass, property } = _decorator;

@ccclass('EnemyBase')
export class EnemyBase extends Component {
    @property
    maxHp: number = 30;

    @property
    moveSpeed: number = 200;

    @property({ tooltip: '与玩家/子弹接触造成的伤害（若采用碰撞伤害）' })
    contactDamage: number = 10;

    @property({ tooltip: '死亡后自动回收到对象池' })
    autoRecycleOnDie: boolean = true;

    @property(ObjectPool)
    poolHost: ObjectPool | null = null;

    private hp: number = 1;
    private alive: boolean = false;
    private eventBus: EventTarget = new EventTarget();

    // 运动/AI辅助
    protected velocity: Vec3 = new Vec3();
    protected moveDir: Vec3 = new Vec3(0, -1, 0);
    protected target: Node | null = null;

    onEnable() {
        this.revive(this.maxHp);
        this.onSpawn();
        this.eventBus.emit('spawn');
    }

    onDisable() {
        this.onDespawn();
        this.eventBus.emit('despawn');
    }

    update(deltaTime: number) {
        if (!this.alive) return;
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
    getHp() { return this.hp; }
    isAlive() { return this.alive; }

    revive(hp?: number) {
        this.hp = Math.max(1, Math.floor(hp ?? this.maxHp));
        this.alive = true;
    }

    takeDamage(amount: number, source?: any) {
        if (!this.alive) return;
        if (amount <= 0) return;
        this.hp = Math.max(0, this.hp - amount);
        this.onHit(amount, source);
        this.eventBus.emit('hit', { amount, hp: this.hp, source });
        if (this.hp <= 0) {
            this.die(source);
        }
    }

    protected die(source?: any) {
        if (!this.alive) return;
        this.alive = false;
        this.onDie(source);
        this.eventBus.emit('die', { source });
        if (this.autoRecycleOnDie) {
            this.recycle();
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
}


