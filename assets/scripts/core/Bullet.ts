import { _decorator, Component, Node } from 'cc';
import { Collider2D, Contact2DType, IPhysics2DContact } from 'cc';
import { ObjectPool } from './ObjectPool';
import { EnemyBase } from './EnemyBase';
import { PlayerActor } from './PlayerActor';
import { ProjectileMover } from './ProjectileMover';
import { DamageDealer, DamageFaction } from './DamageDealer';
import { CollisionLayer, CollisionHelper, CollisionManager } from './CollisionLayers';
const { ccclass, property } = _decorator;

export enum BulletType {
    Straight = 'Straight',
    Fast = 'Fast',
    Slow = 'Slow',
    Spread = 'Spread',
    Homing = 'Homing',
    Laser = 'Laser',
    Rocket = 'Rocket',
    Boomerang = 'Boomerang',
    Pierce = 'Pierce',
    Bounce = 'Bounce',
}

export enum BulletFaction {
    Player = 'Player',
    Enemy = 'Enemy',
}

@ccclass('Bullet')
export class Bullet extends Component {
    @property({ tooltip: '子弹类型' })
    type: BulletType = BulletType.Straight;

    @property({ tooltip: '阵营：Player/Enemy' })
    faction: BulletFaction = BulletFaction.Player;

    @property
    damage: number = 10;

    @property({ tooltip: '子弹寿命（秒），<=0 表示无限（需手动回收）' })
    lifetime: number = 5;

    @property({ tooltip: '回收宿主（有则回收到池，否则销毁）' })
    poolHost: ObjectPool | null = null;

    @property({ tooltip: '启用后自动回收（到寿命或出界）' })
    autoRecycle: boolean = true;

    @property(ProjectileMover)
    mover: ProjectileMover | null = null;

    private _elapsed = 0;
    private _col2d: Collider2D | null = null;

    onEnable() {
        this._elapsed = 0;
        if (!this.mover) this.mover = this.getComponent(ProjectileMover);
        this.setupCollisionLayer();
        this.attachCollider();
    }

    private setupCollisionLayer() {
        // 根据阵营设置碰撞层
        const layer = this.faction === BulletFaction.Player 
            ? CollisionLayer.PlayerBullet 
            : CollisionLayer.EnemyBullet;
        CollisionHelper.setCollisionLayer(this.node, layer);
    }

    onDisable() {
        this.detachCollider();
    }

    update(deltaTime: number) {
        this._elapsed += deltaTime;
        if (this.lifetime > 0 && this._elapsed >= this.lifetime) {
            this.recycle();
            return;
        }
    }

    // ========== 交互 & 回收 ==========
    public onHitTarget(): void {
        this.recycle();
    }

    public recycle(): void {
        if (!this.autoRecycle) return;
        if (this.poolHost && this.poolHost.isValid) {
            this.poolHost.release(this.node);
        } else {
            if (this.node.isValid) this.node.destroy();
        }
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
        // 验证碰撞层是否匹配
        const otherLayer = CollisionHelper.getCollisionLayer(other.node);
        if (otherLayer === null) return;

        const bulletLayer = this.faction === BulletFaction.Player 
            ? CollisionLayer.PlayerBullet 
            : CollisionLayer.EnemyBullet;

        // 检查是否可以碰撞
        if (!CollisionManager.canCollide(bulletLayer, otherLayer)) {
            return;
        }

        // 处理伤害
        const applied = DamageDealer.dealDamage(other.node, this.damage, {
            source: this,
            faction: this.faction === BulletFaction.Player ? DamageFaction.Player : DamageFaction.Enemy,
            now: performance.now() / 1000,
        });
        if (applied) {
            this.onHitTarget();
        }
    }

    private findComponentInNodeOrParent<T>(node: Node, cls: new (...args: any[]) => T): T | null {
        let cur: Node | null = node;
        while (cur) {
            const c = cur.getComponent(cls as any);
            if (c) return c as any;
            cur = cur.parent;
        }
        return null;
    }
}


