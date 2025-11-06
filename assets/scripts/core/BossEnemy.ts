import { _decorator, Component, Node, Vec3, math } from 'cc';
import { EnemyBase } from './EnemyBase';
const { ccclass, property } = _decorator;

@ccclass('BossEnemy')
export class BossEnemy extends EnemyBase {
    @property
    phaseCount: number = 3;

    @property
    fireInterval: number = 1.2;

    @property
    moveAmplitude: number = 60; // 简单上下波动幅度

    private _phase: number = 1;
    private _elapsed: number = 0;
    private _fireElapsed: number = 0;
    private _spawnPos: Vec3 = new Vec3();

    onEnable() {
        super.onEnable();
        this._phase = 1;
        this._elapsed = 0;
        this._fireElapsed = 0;
        this._spawnPos.set(this.node.worldPosition);
        // 标记为 Boss，保证掉落/流程正确
        this.isBoss = true;
        // 自动挂载 BossController（若缺失）
        const ctrl = this.getComponent('BossController' as any);
        if (!ctrl) {
            this.addComponent('BossController' as any);
        }
        // Boss 默认缓慢移动
        this.setMoveDirection(0, 0);
    }

    public applyHpMultiplier(mult: number | undefined) {
        if (!mult || mult <= 0) return;
        const newMax = Math.max(1, Math.floor(this.maxHp * mult));
        this.maxHp = newMax;
        this.revive(newMax);
    }

    protected updateAI(dt: number) {
        this._elapsed += dt;
        this._fireElapsed += dt;
        // 简单多阶段：血量阈值切换
        const hpRatio = this.getHp() / this.maxHp;
        const newPhase = hpRatio <= 0.33 ? 3 : (hpRatio <= 0.66 ? 2 : 1);
        if (newPhase !== this._phase) {
            this._phase = newPhase;
            this.onPhaseChanged(this._phase);
        }

        // 开火间隔随阶段降低
        const interval = Math.max(0.2, this.fireInterval * (1 - (this._phase - 1) * 0.25));
        if (this._fireElapsed >= interval) {
            this._fireElapsed = 0;
            this.fireOnce();
        }
    }

    protected updateMovement(dt: number) {
        // 在出生位置上下波动
        const y = this._spawnPos.y + Math.sin(this._elapsed * 1.2) * this.moveAmplitude;
        const pos = this.node.worldPosition.clone();
        pos.y = y;
        this.node.setWorldPosition(pos);
    }

    protected onHit(amount: number) {
        // 可加受击演出/震动等
    }

    protected onDie() {
        // 胜利触发由 BossController 负责，这里仅保留死亡演出/掉落等
    }

    private onPhaseChanged(phase: number) {
        // 可调整参数，如提高 moveAmplitude 或开火频率
        this.moveAmplitude = 60 + (phase - 1) * 20;
    }

    private fireOnce() {
        // 仅暴露一个钩子，实际发射由外部武器/弹幕系统接管
        // 可以发事件或查找武器组件，这里留空供项目对接
    }
}


