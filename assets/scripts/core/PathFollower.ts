import { _decorator, Component, Node, Vec3, EventTarget, Quat } from 'cc';
const { ccclass, property } = _decorator;

export enum PathMode {
	Once = 'Once',
	Loop = 'Loop',
	PingPong = 'PingPong',
}

export enum FormationType {
	None = 'None',
	Line = 'Line',
	Circle = 'Circle',
	V = 'V',
	Grid = 'Grid',
}

@ccclass('PathFollower')
export class PathFollower extends Component {
	@property({ tooltip: '路径点（按顺序）' })
	waypoints: Node[] = [];

	@property({ tooltip: '起始延时（秒）' })
	startDelay: number = 0;

	@property({ tooltip: '速度（单位/秒）' })
	speed: number = 200;

	@property({ tooltip: '抵达阈值（单位）' })
	arriveThreshold: number = 8;

	@property({ tooltip: '到达路点后的等待（秒）' })
	waitAtWaypoint: number = 0;

	@property({ tooltip: '路径模式：Once/Loop/PingPong' })
	mode: PathMode = PathMode.Once;

	@property({ tooltip: '是否在运动中朝向前进方向' })
	lookAtForward: boolean = false;

	@property({ tooltip: '自动开始跟随' })
	autoStart: boolean = true;

	// Formation
	@property({ tooltip: '编队类型' })
	formation: FormationType = FormationType.None;

	@property({ tooltip: '编队中的序号（0 基）' })
	formationIndex: number = 0;

	@property({ tooltip: '编队总数（用于相对对称/均分）' })
	formationCount: number = 1;

	@property({ tooltip: '编队间距（Line/V/Grid）' })
	spacing: number = 60;

	@property({ tooltip: '编队半径（Circle）' })
	radius: number = 120;

	@property({ tooltip: '编队角度（度，Circle/V）' })
	angleDeg: number = 30;

	private _eventBus: EventTarget = new EventTarget();
	private _started = false;
	private _paused = false;
	private _elapsedDelay = 0;
	private _waitRemain = 0;
	private _dir = 1; // +1 正向，-1 反向（PingPong）
	private _index = 0; // 当前目标路点索引
	private _tmp = new Vec3();
	private _forward = new Vec3();
	private _formationOffset = new Vec3();

	onLoad() {
		this.resetToStart(false);
	}

	start() {
		if (this.autoStart) this.startFollow();
	}

	update(dt: number) {
		if (!this._started || this._paused) return;
		if (!this._hasValidPath()) return;

		if (this._elapsedDelay < this.startDelay) {
			this._elapsedDelay += dt;
			return;
		}

		if (this._waitRemain > 0) {
			this._waitRemain -= dt;
			return;
		}

		const target = this.waypoints[this._index];
		if (!target || !target.isValid) return;
		const cur = this.node.worldPosition.clone();
		const tpos = target.worldPosition.clone();

		// 编队偏移
		this._computeFormationOffset(this._formationOffset);
		tpos.add(this._formationOffset);

		const to = this._tmp.set(tpos.x - cur.x, tpos.y - cur.y, 0);
		const dist = to.length();
		if (dist <= this.arriveThreshold) {
			this._onArriveWaypoint(this._index);
			this._advanceIndex();
			return;
		}
		if (dist > 1e-5) {
			to.normalize();
			this._forward.set(to);
			const step = to.multiplyScalar(this.speed * dt);
			cur.add(step);
			this.node.setWorldPosition(cur);
			if (this.lookAtForward) this._applyLookAt(this._forward);
		}
	}

	// 事件 API
	on(event: 'arrive' | 'complete', cb: (data?: any) => void, target?: any) {
		this._eventBus.on(event, cb, target);
	}
	off(event: 'arrive' | 'complete', cb: (data?: any) => void, target?: any) {
		this._eventBus.off(event, cb, target);
	}

	// 控制 API
	startFollow() { this._started = true; this._paused = false; }
	pause() { this._paused = true; }
	resume() { this._paused = false; }
	stop() { this._started = false; this._paused = false; }
	resetToStart(resetPosition: boolean = true) {
		this._dir = 1;
		this._index = 0;
		this._elapsedDelay = 0;
		this._waitRemain = 0;
		if (resetPosition && this._hasValidPath()) {
			const p0 = this.waypoints[0].worldPosition.clone();
			this._computeFormationOffset(this._formationOffset);
			p0.add(this._formationOffset);
			this.node.setWorldPosition(p0);
		}
	}
	setWaypoints(nodes: Node[]) { this.waypoints = nodes || []; this.resetToStart(true); }
	setFormation(index: number, count: number, type?: FormationType) {
		this.formationIndex = Math.max(0, Math.floor(index));
		this.formationCount = Math.max(1, Math.floor(count));
		if (type != null) this.formation = type;
	}

	private _hasValidPath(): boolean {
		return Array.isArray(this.waypoints) && this.waypoints.length >= 1;
	}

	private _advanceIndex() {
		if (!this._hasValidPath()) return;
		const n = this.waypoints.length;
		if (n === 1) {
			this._emitComplete();
			if (this.mode === PathMode.Once) this.stop();
			return;
		}
		const atEnd = (this._index === (this._dir > 0 ? n - 1 : 0));
		if (!atEnd) {
			this._index += this._dir;
			if (this.waitAtWaypoint > 0) this._waitRemain = this.waitAtWaypoint;
			return;
		}
		// 末端
		switch (this.mode) {
			case PathMode.Once:
				this._emitComplete();
				this.stop();
				break;
			case PathMode.Loop:
				this._index = (this._dir > 0) ? 0 : n - 1;
				if (this.waitAtWaypoint > 0) this._waitRemain = this.waitAtWaypoint;
				break;
			case PathMode.PingPong:
				this._dir *= -1;
				this._index += this._dir; // 往回一个
				if (this.waitAtWaypoint > 0) this._waitRemain = this.waitAtWaypoint;
				break;
		}
	}

	private _onArriveWaypoint(i: number) {
		this._eventBus.emit('arrive', { index: i });
	}

	private _emitComplete() {
		this._eventBus.emit('complete');
	}

	private _applyLookAt(dir: Vec3) {
		// 2D：Z=0 平面，使用朝向 Y 轴正方向为前向的假设
		if (dir.lengthSqr() < 1e-6) return;
		const forward = new Vec3(dir.x, dir.y, 0);
		forward.normalize();
		// 将 (0,1,0) 旋转到 forward
		const from = new Vec3(0, 1, 0);
		const dot = Math.min(1, Math.max(-1, from.dot(forward)));
		if (Math.abs(dot - 1) < 1e-6) return; // 无需旋转
		const axis = new Vec3(from.y * forward.z - from.z * forward.y, from.z * forward.x - from.x * forward.z, from.x * forward.y - from.y * forward.x);
		if (axis.lengthSqr() < 1e-6) {
			// 反向
			this.node.setRotationFromEuler(0, 0, 180);
			return;
		}
		axis.normalize();
		const angle = Math.acos(dot);
		const q = new Quat();
		Quat.fromAxisAngle(q, axis, angle);
		this.node.setRotation(q);
	}

	private _computeFormationOffset(out: Vec3) {
		out.set(0, 0, 0);
		const idx = this.formationIndex | 0;
		const cnt = Math.max(1, this.formationCount | 0);
		switch (this.formation) {
			case FormationType.Line: {
				const center = (cnt - 1) * 0.5;
				const offset = (idx - center) * this.spacing;
				out.x = offset;
				break;
			}
			case FormationType.Circle: {
				const step = (Math.PI * 2) / cnt;
				const ang = step * idx;
				out.x = Math.cos(ang) * this.radius;
				out.y = Math.sin(ang) * this.radius;
				break;
			}
			case FormationType.V: {
				// 从中心展开两翼
				const wing = Math.floor((idx + 1) / 2);
				const side = (idx % 2 === 0) ? -1 : 1; // 交替左右
				const rad = this.angleDeg * Math.PI / 180;
				out.x = side * wing * this.spacing * Math.cos(rad);
				out.y = -wing * this.spacing * Math.sin(rad);
				break;
			}
			case FormationType.Grid: {
				const cols = Math.max(1, Math.ceil(Math.sqrt(cnt)));
				const rows = Math.max(1, Math.ceil(cnt / cols));
				const c = idx % cols;
				const r = Math.floor(idx / cols);
				const cx = (cols - 1) * 0.5;
				const cy = (rows - 1) * 0.5;
				out.x = (c - cx) * this.spacing;
				out.y = -(r - cy) * this.spacing;
				break;
			}
			case FormationType.None:
			default:
				break;
		}
	}
}


