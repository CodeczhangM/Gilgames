import { _decorator, Component, Prefab, AudioClip, SpriteFrame, resources, Asset } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ResourceManager')
export class ResourceManager extends Component {
    private static _instance: ResourceManager | null = null;

    static get instance(): ResourceManager | null {
        return this._instance;
    }

    private prefabCache = new Map<string, Prefab>();
    private audioCache = new Map<string, AudioClip>();
    private spriteCache = new Map<string, SpriteFrame>();

    onLoad() {
        ResourceManager._instance = this;
    }

    onDestroy() {
        if (ResourceManager._instance === this) {
            ResourceManager._instance = null;
        }
        this.prefabCache.clear();
        this.audioCache.clear();
        this.spriteCache.clear();
    }

    // 资源路径应位于 assets/resources 下，传入 resources 目录相对路径
    async loadPrefab(path: string): Promise<Prefab> {
        const cached = this.prefabCache.get(path);
        if (cached) return cached;
        const prefab = await this.load<Prefab>(path, Prefab);
        this.prefabCache.set(path, prefab);
        return prefab;
    }

    async loadAudio(path: string): Promise<AudioClip> {
        const cached = this.audioCache.get(path);
        if (cached) return cached;
        const clip = await this.load<AudioClip>(path, AudioClip);
        this.audioCache.set(path, clip);
        return clip;
    }

    async loadSpriteFrame(path: string): Promise<SpriteFrame> {
        const cached = this.spriteCache.get(path);
        if (cached) return cached;
        const sprite = await this.load<SpriteFrame>(path, SpriteFrame);
        this.spriteCache.set(path, sprite);
        return sprite;
    }

    private load<T extends Asset>(path: string, type: { new(...args: any[]): T } | Function): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            resources.load(path, type as any, (err: Error | null, asset: T) => {
                if (err != null) {
                    reject(err);
                } else {
                    resolve(asset);
                }
            });
        });
    }
}


