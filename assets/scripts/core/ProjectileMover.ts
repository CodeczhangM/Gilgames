import { _decorator, Component, Node, Vec3, math } from 'cc';
const { ccclass, property } = _decorator;

export enum MoveStrategy {
    Straight = 'Straight',
    Sine = 'Sine',
    Homing = 'Homing',
    Circle = 'Circle',
    Accelerate = 'Accelerate',
    Decelerate = 'Decelerate',
    ZigZag = 'ZigZag',
    Spiral = 'Spiral',
    Bezier = 'Bezier',
    RandomDrift = 'RandomDrift',
}

@ccclass('ProjectileMover')
export class ProjectileMover extends Component {
    @property({ tooltip: '运动策略' })
    strategy: MoveStrategy = MoveStrategy.Straight;

    @property({ tooltip: '基础速度（单位/秒）' })
    speed: number = 800;

    @property({ tooltip: '初始方向（单位向量）' })
    dirX: number = 0;
    @property
    dirY: number = 1;

    // Sine / ZigZag
    @property({ tooltip: '横向/法向振幅（单位）' })
    amplitude: number = 40;
    @property({ tooltip: '振荡频率（Hz）' })
    frequency: number = 2;

    // Homing
    @property(Node)
    target: Node | null = null;
    @property({ tooltip: '跟踪转向速率（度/秒）' })
    turnRateDeg: number = 360;

    // Circle / Spiral
    @property({ tooltip: '半径（圆/螺旋）' })
    radius: number = 100;
    @property({ tooltip: '角速度（度/秒）' })
    angularSpeedDeg: number = 180;
    @property({ tooltip: '螺旋半径增长速度（单位/秒）' })
    spiralRadiusGrow: number = 30;

    // Accelerate / Decelerate
    @property({ tooltip: '加速度（单位/秒^2），可为负' })
    acceleration: number = 600;

    // Bezier（简单二次）
    @property({ tooltip: 'Bezier 控制点相对坐标 X' })
    cpx: number = 0;
    @property
    cpy: number = 200;
    @property({ tooltip: 'Bezier 终点相对坐标 X' })
    endx: number = 0;
    @property
    endy: number = 600;
    @property({ tooltip: 'Bezier 总时长（秒）' })
    duration: number = 1.5;

    // RandomDrift
    @property({ tooltip: '漂移强度（单位/秒）' })
    driftStrength: number = 60;

    private _elapsed = 0;
    private _dir: Vec3 = new Vec3(0, 1, 0);
    private _origin: Vec3 = new Vec3();
    private _angleAccumRad = 0;
    private _speed: number = 0;

    onEnable() {
        this._elapsed = 0;
        this._angleAccumRad = 0;
        this._origin.set(this.node.worldPosition);
        this._dir.set(this.dirX, this.dirY, 0);
        if (this._dir.lengthSqr() === 0) this._dir.set(0, 1, 0);
        this._dir.normalize();
        this._speed = this.speed;
    }

    update(deltaTime: number) {
        this._elapsed += deltaTime;
        switch (this.strategy) {
            case MoveStrategy.Straight:
                this.moveStraight(deltaTime, this._speed);
                break;
            case MoveStrategy.Sine:
                this.moveSine(deltaTime);
                break;
            case MoveStrategy.Homing:
                this.moveHoming(deltaTime);
                break;
            case MoveStrategy.Circle:
                this.moveCircle(deltaTime);
                break;
            case MoveStrategy.Accelerate:
                this._speed += this.acceleration * deltaTime;
                this.moveStraight(deltaTime, this._speed);
                break;
            case MoveStrategy.Decelerate:
                this._speed += (-Math.abs(this.acceleration)) * deltaTime;
                this._speed = Math.max(0, this._speed);
                this.moveStraight(deltaTime, this._speed);
                break;
            case MoveStrategy.ZigZag:
                this.moveZigZag(deltaTime);
                break;
            case MoveStrategy.Spiral:
                this.moveSpiral(deltaTime);
                break;
            case MoveStrategy.Bezier:
                this.moveBezier();
                break;
            case MoveStrategy.RandomDrift:
                this.moveRandomDrift(deltaTime);
                break;
        }
    }

    private moveStraight(dt: number, spd: number) {
        const step = new Vec3(this._dir.x, this._dir.y, 0).multiplyScalar(spd * dt);
        const pos = this.node.worldPosition.clone();
        pos.add(step);
        this.node.setWorldPosition(pos);
    }

    private moveSine(dt: number) {
        // 沿主方向前进 + 法向振荡
        const forward = new Vec3(this._dir.x, this._dir.y, 0).multiplyScalar(this._speed * dt);
        const normal = new Vec3(-this._dir.y, this._dir.x, 0);
        const offset = Math.sin(this._elapsed * Math.PI * 2 * this.frequency) * this.amplitude;
        const pos = this.node.worldPosition.clone();
        pos.add(forward);
        pos.add(normal.multiplyScalar(offset * dt));
        this.node.setWorldPosition(pos);
    }

    private moveZigZag(dt: number) {
        // 方波切换法向方向
        const forward = new Vec3(this._dir.x, this._dir.y, 0).multiplyScalar(this._speed * dt);
        const normal = new Vec3(-this._dir.y, this._dir.x, 0);
        const sign = Math.sign(Math.sin(this._elapsed * Math.PI * 2 * this.frequency)) || 1;
        const pos = this.node.worldPosition.clone();
        pos.add(forward);
        pos.add(normal.multiplyScalar(sign * this.amplitude * dt));
        this.node.setWorldPosition(pos);
    }

    private moveHoming(dt: number) {
        if (!this.target || !this.target.isValid) {
            this.moveStraight(dt, this._speed);
            return;
        }
        const pos = this.node.worldPosition.clone();
        const tp = this.target.worldPosition.clone();
        const toT = tp.subtract(pos);
        toT.z = 0;
        if (toT.lengthSqr() > 1e-6) {
            toT.normalize();
            const maxRad = math.toRadian(this.turnRateDeg) * dt;
            this._dir = this.rotateTowards(this._dir, toT, maxRad);
        }
        this.moveStraight(dt, this._speed);
    }

    private moveCircle(dt: number) {
        const omega = math.toRadian(this.angularSpeedDeg);
        this._angleAccumRad += omega * dt;
        const right = new Vec3(this._dir.y, -this._dir.x, 0); // 右法向
        const center = this._origin.clone().add(right.multiplyScalar(this.radius));
        const pos = new Vec3(
            center.x + Math.cos(this._angleAccumRad) * this.radius,
            center.y + Math.sin(this._angleAccumRad) * this.radius,
            0
        );
        this.node.setWorldPosition(pos);
    }

    private moveSpiral(dt: number) {
        const omega = math.toRadian(this.angularSpeedDeg);
        this._angleAccumRad += omega * dt;
        const r = this.radius + this.spiralRadiusGrow * this._elapsed;
        const right = new Vec3(this._dir.y, -this._dir.x, 0);
        const center = this._origin.clone().add(right.multiplyScalar(r));
        const pos = new Vec3(
            center.x + Math.cos(this._angleAccumRad) * r,
            center.y + Math.sin(this._angleAccumRad) * r,
            0
        );
        this.node.setWorldPosition(pos);
    }

    private moveBezier() {
        const T = Math.max(0.0001, this.duration);
        const t = math.clamp(this._elapsed / T, 0, 1);
        // 二次贝塞尔：B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
        const p0 = this._origin;
        const p1 = new Vec3(this._origin.x + this.cpx, this._origin.y + this.cpy, 0);
        const p2 = new Vec3(this._origin.x + this.endx, this._origin.y + this.endy, 0);
        const it = 1 - t;
        const x = it * it * p0.x + 2 * it * t * p1.x + t * t * p2.x;
        const y = it * it * p0.y + 2 * it * t * p1.y + t * t * p2.y;
        this.node.setWorldPosition(x, y, 0);
    }

    private moveRandomDrift(dt: number) {
        const forward = new Vec3(this._dir.x, this._dir.y, 0).multiplyScalar(this._speed * dt);
        const rx = (Math.random() * 2 - 1) * this.driftStrength * dt;
        const ry = (Math.random() * 2 - 1) * this.driftStrength * dt;
        const pos = this.node.worldPosition.clone();
        pos.add(forward);
        pos.x += rx;
        pos.y += ry;
        this.node.setWorldPosition(pos);
    }

    private rotateTowards(from: Vec3, to: Vec3, maxRadiansDelta: number): Vec3 {
        const f = from.clone().normalize();
        const t = to.clone().normalize();
        let dot = math.clamp(f.dot(t), -1, 1);
        let angle = Math.acos(dot);
        if (angle < 1e-5) return t;
        const ratio = Math.min(1, maxRadiansDelta / angle);
        const x = f.x + (t.x - f.x) * ratio;
        const y = f.y + (t.y - f.y) * ratio;
        const r = new Vec3(x, y, 0);
        r.normalize();
        return r;
    }
}


