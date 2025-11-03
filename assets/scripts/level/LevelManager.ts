import { _decorator, Component, EventTarget, TextAsset, Node, instantiate } from 'cc';
import { LevelData, LevelEvent, LevelEventType, WaveConfig, EnemySpawnConfig } from './LevelData';
import { ResourceManager } from '../resource/ResourceManager';
import { GameManager } from '../GameManager';
import { EnemyBase } from '../core/EnemyBase';
import { EnemySpawner } from '../core/EnemySpawner';
const { ccclass, property } = _decorator;

@ccclass('LevelManager')
export class LevelManager extends Component {
    @property(TextAsset)
    levelJson: TextAsset | null = null;
    @property(Node)
    spawnRoot: Node | null = null;

    private eventBus: EventTarget = new EventTarget();
    private levelData: LevelData | null = null;
    private elapsedTime = 0;
    private nextEventIndex = 0;
    private startedWaveIndices = new Set<number>();
    private bossSpawned = false;

    start() {
        if (this.levelJson) {
            this.loadLevelFromText(this.levelJson.text);
        }
        this.elapsedTime = 0;
        this.nextEventIndex = 0;
        this.startedWaveIndices.clear();
    }

    update(deltaTime: number) {
        if (!this.levelData) return;
        this.elapsedTime += deltaTime;
        this.tryDispatchEvents(this.elapsedTime);
        this.tryStartWaves(this.elapsedTime);
    }

    // 对外：监听关卡事件
    on(event: 'level-event' | 'wave-start' | 'spawn' | 'boss-appear', callback: (data: any) => void, target?: any) {
        this.eventBus.on(event, callback, target);
    }

    off(event: 'level-event' | 'wave-start' | 'spawn' | 'boss-appear', callback: (data: any) => void, target?: any) {
        this.eventBus.off(event, callback, target);
    }

    // 载入关卡
    loadLevelFromText(jsonText: string) {
        try {
            const json = JSON.parse(jsonText);
            this.levelData = LevelData.fromJSON(json);
            this.elapsedTime = 0;
            this.nextEventIndex = 0;
            this.startedWaveIndices.clear();
        } catch (e) {
            console.error('[LevelManager] 解析 Level JSON 失败: ', e);
        }
    }

    getLevelData(): LevelData | null {
        return this.levelData;
    }

    // 事件调度：按时间顺序触发
    private tryDispatchEvents(now: number) {
        const data = this.levelData;
        if (!data) return;
        const events = data.events;
        while (this.nextEventIndex < events.length && events[this.nextEventIndex].time <= now) {
            const evt: LevelEvent = events[this.nextEventIndex++];
            this.eventBus.emit('level-event', evt);
            this.handleBuiltinEvent(evt);
        }
    }

    // 内建事件的默认处理（可被外部监听覆盖）
    private handleBuiltinEvent(evt: LevelEvent) {
        switch (evt.type) {
            case LevelEventType.BgmChange:
            case LevelEventType.Dialogue:
            case LevelEventType.ScreenShake:
            case LevelEventType.SpawnItem:
            case LevelEventType.Script:
            case LevelEventType.Custom:
            default:
                break;
        }
    }

    // 波次调度：到点启动
    private tryStartWaves(now: number) {
        const data = this.levelData;
        if (!data) return;
        const waves = data.waves ?? [] as WaveConfig[];
        for (let i = 0; i < waves.length; i++) {
            const wave = waves[i];
            if (!this.startedWaveIndices.has(i) && wave.startTime <= now) {
                this.startedWaveIndices.add(i);
                this.eventBus.emit('wave-start', { index: i, wave });
                this.startWave(wave);
            }
        }
        // Boss 出场
        if (!this.bossSpawned && data.boss && data.boss.appearTime != null && data.boss.appearTime <= now) {
            this.bossSpawned = true;
            this.eventBus.emit('boss-appear', data.boss);
            this.autoSpawnBossIfPossible().catch(() => {});
        }
    }

    private startWave(wave: WaveConfig) {
        for (const spawn of wave.spawns) {
            this.scheduleSpawnBatch(spawn);
        }
    }

    private scheduleSpawnBatch(spawn: EnemySpawnConfig) {
        const total = Math.max(0, spawn.count | 0);
        const interval = Math.max(0, spawn.interval || 0);
        if (total === 0) return;

        let spawned = 0;
        // 使用 Cocos 的 schedule 来分批生成
        const cb = () => {
            spawned++;
            this.eventBus.emit('spawn', { spawn, indexInBatch: spawned - 1 });
            this.autoSpawnIfPossible(spawn).catch(() => {});
            if (spawned >= total) {
                this.unschedule(cb);
            }
        };
        // 立即触发一次，然后按间隔调度
        cb();
        if (total > 1 && interval > 0) {
            this.schedule(cb, interval);
        }
    }

    private async autoSpawnIfPossible(spawn: EnemySpawnConfig) {
        const data = this.levelData;
        if (!data) return;
        const res = (data.enemyResources || {})[spawn.type];
        if (!this.spawnRoot) return;
        // 优先使用场景中配置好的 EnemySpawner（通过 typeKey 匹配）
        const spawner = this.findSpawnerByType(spawn.type);
        if (spawner) {
            spawner.spawnOnce();
            return;
        }
        if (!res || !res.prefab) return;
        const rm = ResourceManager.instance;
        if (!rm) return;
        try {
            const prefab = await rm.loadPrefab(res.prefab);
            const node = instantiate(prefab);
            node.setParent(this.spawnRoot);
        } catch (e) {
            // 资源可能未放在 resources，或路径错误
        }
    }

    private findSpawnerByType(typeKey: string): EnemySpawner | null {
        if (!this.spawnRoot) return null;
        const list = this.spawnRoot.getComponentsInChildren(EnemySpawner);
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            if (s && s.typeKey === typeKey) return s;
        }
        return null;
    }

    private async autoSpawnBossIfPossible() {
        const data = this.levelData;
        if (!data || !data.boss) return;
        const res = data.boss.resource;
        if (!res || !res.prefab || !this.spawnRoot) return;
        const rm = ResourceManager.instance;
        if (!rm) return;
        try {
            const prefab = await rm.loadPrefab(res.prefab);
            const node = instantiate(prefab);
            node.setParent(this.spawnRoot);
            // 应用 Boss 参数
            const bossComp = (node.getComponent('BossEnemy') as any) || (node.getComponent(EnemyBase) as any);
            if (bossComp) {
                if (typeof bossComp.applyHpMultiplier === 'function') {
                    bossComp.applyHpMultiplier(data.boss.hpMultiplier);
                }
                // 监听 Boss 死亡 -> 触发胜利
                if (typeof bossComp.on === 'function') {
                    bossComp.on('die', async () => {
                        const gm = GameManager.instance;
                        if (gm) {
                            await gm.triggerVictory({ reason: 'boss-dead' });
                        }
                    }, this);
                }
            }
        } catch (e) {
            // ignore
        }
    }
}


