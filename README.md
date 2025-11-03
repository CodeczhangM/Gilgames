## 对象池与子弹使用示例

以下演示如何用 `ObjectPool` 获取/归还子弹节点，并在发射后按时回收。

### 场景准备
- 在场景中放置一个节点挂载 `ObjectPool` 组件：
  - `prefab`: 拖入子弹预制体（该预制体应挂载 `Bullet` 脚本）
  - `initialSize`: 20（可选）
  - `autoExpand`: 勾选
  - `container`: 指向一个隐藏节点（用于存放回收的子弹）

### 代码示例
```ts
// 在你的发射逻辑组件中
import { _decorator, Component, Node } from 'cc';
import { ObjectPool } from './assets/scripts/core/ObjectPool';
import { Bullet, BulletType } from './assets/scripts/core/Bullet';
const { ccclass, property } = _decorator;

@ccclass('ShootExample')
export class ShootExample extends Component {
    @property(ObjectPool)
    bulletPool: ObjectPool | null = null;

    @property(Node)
    projectileRoot: Node | null = null;

    fireOnce() {
        if (!this.bulletPool) return;
        const bulletNode = this.bulletPool.acquire(this.projectileRoot ?? this.node);
        if (!bulletNode) return;
        bulletNode.setWorldPosition(this.node.worldPosition);
        const bullet = bulletNode.getComponent(Bullet);
        if (bullet) {
            bullet.type = BulletType.Straight;
            bullet.speed = 1000;
            bullet.dirX = 0;
            bullet.dirY = 1;
            bullet.poolHost = this.bulletPool;
            bullet.autoRecycle = true;
        }
    }

    // 命中后回收（示例）：
    onBulletHit(bulletNode: Node) {
        const bullet = bulletNode.getComponent(Bullet);
        if (bullet) {
            bullet.recycle();
        } else if (this.bulletPool) {
            this.bulletPool.release(bulletNode);
        }
    }
}
```

说明：
- `acquire(parent?)` 从池中取出子弹并设为激活状态，自动挂到 `parent`。
- `Bullet.recycle()` 会将节点归还到 `ObjectPool` 指定的 `container`，未配置池时会销毁节点。
# Gilgames
