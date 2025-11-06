import { _decorator, Component, Node, input, Input, EventMouse, EventTouch, Vec2 } from 'cc';
import { PlayerActor } from '../core/PlayerActor';
const { ccclass, property } = _decorator;

@ccclass('InputController')
export class InputController extends Component {
    @property(PlayerActor)
    player: PlayerActor | null = null;

    @property({ tooltip: '按下时开启自动连发' })
    holdToFire: boolean = true;

    private isPointerDown: boolean = false;
    private lastPos: Vec2 = new Vec2();
    private curPos: Vec2 = new Vec2();

    onEnable() {
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    onDisable() {
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);

        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    update(deltaTime: number) {
        // 鼠标未按下时不驱动移动；触摸由移动事件驱动
    }

    // ========== 鼠标 ==========
    private onMouseDown(e: EventMouse) {
        this.isPointerDown = true;
        this.curPos.set(e.getLocationX(), e.getLocationY());
        this.lastPos.set(this.curPos);
        if (this.holdToFire) this.player?.startFire();
    }

    private onMouseMove(e: EventMouse) {
        this.curPos.set(e.getLocationX(), e.getLocationY());
        if (!this.isPointerDown) return;
        const dx = this.curPos.x - this.lastPos.x;
        const dy = this.curPos.y - this.lastPos.y;
        this.lastPos.set(this.curPos);
        this.applyMoveDelta(dx, dy);
    }

    private onMouseUp(e: EventMouse) {
        this.isPointerDown = false;
        this.player?.setMoveDirection(0, 0);
        if (this.holdToFire) this.player?.stopFire();
    }

    // ========== 触摸 ==========
    private onTouchStart(e: EventTouch) {
        const loc = e.getLocation();
        this.isPointerDown = true;
        this.curPos.set(loc.x, loc.y);
        this.lastPos.set(this.curPos);
        if (this.holdToFire) this.player?.startFire();
    }

    private onTouchMove(e: EventTouch) {
        const loc = e.getLocation();
        const dx = loc.x - this.lastPos.x;
        const dy = loc.y - this.lastPos.y;
        this.lastPos.set(loc.x, loc.y);
        this.applyMoveDelta(dx, dy);
    }

    private onTouchEnd(e: EventTouch) {
        this.isPointerDown = false;
        this.player?.setMoveDirection(0, 0);
        if (this.holdToFire) this.player?.stopFire();
    }

    // ========== 应用输入到玩家 ==========
    private applyMoveDelta(dx: number, dy: number) {
        if (!this.player) return;
        const len = Math.hypot(dx, dy);
        if (len <= 0.0001) return;
        const nx = dx / len;
        const ny = dy / len;
        this.player.setMoveDirection(nx, ny);
    }
}


