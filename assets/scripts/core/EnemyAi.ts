import { _decorator, Component, Node, Vec3, math } from 'cc';
import { EnemyBase } from './EnemyBase';
const { ccclass, property } = _decorator;

export enum EnemyAIState {
	Idle = 'Idle',
	Patrol = 'Patrol',
	Chase = 'Chase',
	Attack = 'Attack',
	Disabled = 'Disabled',
}

@ccclass('EnemyAi')
export class EnemyAi extends Component {
	@property({ tooltip: '视野范围（进入则开始追击）' })
	sightRange: number = 600;

	@property({ tooltip: '攻击范围（进入则尝试攻击）' })
	attackRange: number = 220;

	@property({ tooltip: '巡逻时速度（单位/秒）' })
	patrolSpeed: number = 120;

	@property({ tooltip: '追击时速度（单位/秒）' })
	chaseSpeed: number = 240;

	@property({ tooltip: '攻击冷却（秒）' })
	attackCooldown: number = 1.2;

	@property({ tooltip: '巡逻移动方向（单位向量）X' })
	patrolDirX: number = 0;
	@property
	patrolDirY: number = -1;

	@property({ tooltip: '自动查找场景中的玩家（第一个 PlayerActor）' })
	autoFindPlayer: boolean = true;

	private _state: EnemyAIState = EnemyAIState.Idle;
	private _enemy: EnemyBase | null = null;
	private _playerNode: Node | null = null;
	private _attackElapsed = 0;
	private _tmpV: Vec3 = new Vec3();

	onEnable() {
		this._enemy = this.getComponent(EnemyBase);
		this._attackElapsed = this.attackCooldown; // 允许立即攻击
		if (!this._enemy) return;
		this._state = EnemyAIState.Idle;
		this._enemy.on('spawn', this._onEnemySpawn, this);
		this._enemy.on('hit', this._onEnemyHit, this);
		this._enemy.on('die', this._onEnemyDie, this);
		// 立即初始化一次
		this._onEnemySpawn();
	}

	onDisable() {
		if (this._enemy) {
			this._enemy.off('spawn', this._onEnemySpawn, this);
			this._enemy.off('hit', this._onEnemyHit, this);
			this._enemy.off('die', this._onEnemyDie, this);
		}
		this._enemy = null;
		this._playerNode = null;
		this._state = EnemyAIState.Disabled;
	}

	update(dt: number) {
		if (!this._enemy || !this._enemy.isAlive()) return;
		this._attackElapsed += dt;
		if (this.autoFindPlayer && (!this._playerNode || !this._playerNode.isValid)) {
			this._playerNode = this._findPlayerNode();
		}
		this._fsmTick(dt);
	}

	public getState(): EnemyAIState { return this._state; }

	private _onEnemySpawn = () => {
		if (!this._enemy) return;
		this._attackElapsed = this.attackCooldown;
		// 默认进入巡逻
		this._switchState(EnemyAIState.Patrol);
	};

	private _onEnemyHit = () => {
		// 受击后若不在攻击范围内，至少进入追击
		if (!this._enemy || !this._enemy.isAlive()) return;
		if (this._state === EnemyAIState.Attack) return;
		this._switchState(EnemyAIState.Chase);
	};

	private _onEnemyDie = () => {
		this._switchState(EnemyAIState.Disabled);
		if (this._enemy) this._enemy.setMoveDirection(0, 0);
	};

	private _fsmTick(dt: number) {
		switch (this._state) {
			case EnemyAIState.Idle:
				this._tickIdle();
				break;
			case EnemyAIState.Patrol:
				this._tickPatrol();
				break;
			case EnemyAIState.Chase:
				this._tickChase();
				break;
			case EnemyAIState.Attack:
				this._tickAttack();
				break;
		}
	}

	private _tickIdle() {
		this._enemy?.setMoveDirection(0, 0);
		this._autoTransitionByDistance();
	}

	private _tickPatrol() {
		if (!this._enemy) return;
		// 按设定方向以巡逻速度移动
		const dir = this._tmpV.set(this.patrolDirX, this.patrolDirY, 0);
		if (dir.lengthSqr() === 0) {
			dir.set(0, -1, 0);
		}
		dir.normalize();
		// 临时覆盖移动速度：通过 velocity 叠加不会改变 EnemyBase.moveSpeed
		this._enemy.setMoveDirection(dir.x, dir.y);
		(this._enemy as any).moveSpeed = this.patrolSpeed;
		this._autoTransitionByDistance();
	}

	private _tickChase() {
		if (!this._enemy) return;
		const target = this._playerNode;
		if (!target || !target.isValid) {
			this._switchState(EnemyAIState.Patrol);
			return;
		}
		const myPos = this._enemy.node.worldPosition;
		const toT = this._tmpV.set(target.worldPosition.x - myPos.x, target.worldPosition.y - myPos.y, 0);
		const dist = toT.length();
		if (dist > 1e-3) {
			toT.normalize();
			this._enemy.setMoveDirection(toT.x, toT.y);
			(this._enemy as any).moveSpeed = this.chaseSpeed;
		}
		// 进入攻击范围则切换
		if (dist <= this.attackRange) {
			this._switchState(EnemyAIState.Attack);
		}
	}

	private _tickAttack() {
		if (!this._enemy) return;
		const target = this._playerNode;
		if (!target || !target.isValid) {
			this._switchState(EnemyAIState.Patrol);
			return;
		}
		// 停止移动进行攻击
		this._enemy.setMoveDirection(0, 0);
		const myPos = this._enemy.node.worldPosition;
		const dist = Vec3.distance(myPos, target.worldPosition as any);
		if (dist > this.attackRange * 1.1) {
			// 目标离开攻击范围一定距离，回到追击
			this._switchState(EnemyAIState.Chase);
			return;
		}
		// 触发一次“攻击”钩子（这里仅发出事件/调用虚方法，具体发弹由外部系统接入）
		if (this._attackElapsed >= this.attackCooldown) {
			this._attackElapsed = 0;
			this._performAttack();
		}
	}

	private _performAttack() {
		// 预留：可通过在 Enemy 节点上挂武器组件、弹幕系统等实现
		// 这里不直接实例化子弹，只是提供一个扩展点：
		// 1) 若敌人组件上实现 fireOnce():void 则调用它
		// 2) 否则什么也不做（由外部监听或自定义子类扩展）
		const anyEnemy = this._enemy as any;
		if (anyEnemy && typeof anyEnemy.fireOnce === 'function') {
			try { anyEnemy.fireOnce(); } catch {}
		}
	}

	private _autoTransitionByDistance() {
		const enemy = this._enemy;
		if (!enemy) return;
		const target = this._playerNode;
		if (!target || !target.isValid) return;
		const dist =  Vec3.distance(enemy.node.worldPosition, target.worldPosition as any);
		if (dist <= this.attackRange) {
			this._switchState(EnemyAIState.Attack);
			return;
		}
		if (dist <= this.sightRange) {
			this._switchState(EnemyAIState.Chase);
			return;
		}
	}

	private _switchState(s: EnemyAIState) {
		if (this._state === s) return;
		this._state = s;
	}

	private _findPlayerNode(): Node | null {
		// 简单策略：在场景树中寻找第一个带有 'PlayerActor' 名称的组件或节点名包含 'Player'
		// 为避免依赖类型引入 PlayerActor，这里只通过名称/节点名模糊查找
		const root = this.node.scene;
		if (!root) return null;
		const stack: Node[] = [root];
		while (stack.length) {
			const n = stack.pop()!;
			// 组件名匹配
			const comps = n.components;
			for (let i = 0; i < comps.length; i++) {
				const name = (comps[i] as any)?.constructor?.name;
				if (name === 'PlayerActor') return n;
			}
			if (n.name.toLowerCase().includes('player')) return n;
			for (const c of n.children) stack.push(c);
		}
		return null;
	}
}
