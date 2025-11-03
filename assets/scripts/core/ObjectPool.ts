import { _decorator, Component, Node, Prefab, instantiate } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ObjectPool')
export class ObjectPool extends Component {
    @property(Prefab)
    prefab: Prefab | null = null;

    @property({ tooltip: '启动时预热数量' })
    initialSize: number = 0;

    @property({ tooltip: '池子为空时是否自动扩容' })
    autoExpand: boolean = true;

    @property(Node)
    container: Node | null = null; // 承载回收节点的父节点（不展示，可放到隐藏层）

    private pool: Node[] = [];

    onLoad() {
        if (!this.container) this.container = this.node;
        if (this.initialSize > 0) {
            this.preload(this.initialSize);
        }
    }

    onDestroy() {
        this.clear();
    }

    // 预热指定数量
    preload(count: number) {
        if (!this.prefab || !this.container) return;
        for (let i = 0; i < count; i++) {
            const node = instantiate(this.prefab);
            node.parent = this.container;
            node.active = false;
            this.pool.push(node);
        }
    }

    // 获取一个实例（若没有可用则按需创建）
    acquire(parent?: Node): Node | null {
        if (!this.prefab) return null;
        let node: Node | undefined = this.pool.pop();
        if (!node) {
            if (!this.autoExpand) return null;
            node = instantiate(this.prefab);
        }
        if (parent) node.parent = parent; else node.parent = this.node.parent ?? this.node;
        node.active = true;
        return node;
    }

    // 归还实例到对象池
    release(node: Node) {
        if (!node || !this.container) return;
        node.active = false;
        node.parent = this.container;
        this.pool.push(node);
    }

    // 清空并销毁
    clear() {
        while (this.pool.length > 0) {
            const n = this.pool.pop();
            if (n && n.isValid) n.destroy();
        }
        this.pool.length = 0;
    }

    // 统计
    available(): number { return this.pool.length; }
}


