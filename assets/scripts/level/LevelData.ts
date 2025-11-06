// 关卡数据实体与相关类型定义

export enum EnemyType {
    Meteor = 'Meteor',
    Fighter = 'Fighter',
    Shooter = 'Shooter',
    Kamikaze = 'Kamikaze',
    Elite = 'Elite',
    Boss = 'Boss'
}

export enum DropType {
    WeaponUpgrade = 'WeaponUpgrade', // 武器升级（通用）
    WeaponStraight = 'WeaponStraight', // 直线武器
    WeaponSpread = 'WeaponSpread', // 散射武器
    WeaponHoming = 'WeaponHoming', // 追踪武器
    WeaponLaser = 'WeaponLaser', // 激光武器
    WeaponRocket = 'WeaponRocket', // 火箭武器
    Coin = 'Coin', // 金币
    Health = 'Health', // 生命恢复
    Shield = 'Shield', // 护盾
}

// 敌人资源定义，可根据需要扩展（prefab、sprite、audio等）
export interface EnemyResource {
    prefab?: string; // 预制体资源路径或 uuid
    sprite?: string; // 备用：精灵图路径
    audio?: string;  // 备用：专属音效
}

// 掉落定义：类型 + 概率（0~1）
export interface EnemyDropItem {
    type: DropType;
    chance: number; // 0~1 概率，1.0 表示必定掉落（如Boss固定掉落）
    count?: number; // 掉落数量（默认1）
    data?: Record<string, any>; // 额外数据（如武器类型、等级等）
}

// 单批次刷怪配置
export interface EnemySpawnConfig {
    type: EnemyType;
    count: number;
    interval: number; // 单位：秒；同批次内生成间隔
    pathId?: number;  // 路径/轨迹编号（由子系统解释）
    resource?: EnemyResource; // 若不提供则从全局资源表取
    drops?: EnemyDropItem[];  // 覆盖或追加默认掉落表
}

// 波次配置：在 startTime 时刻开始该波
export interface WaveConfig {
    startTime: number; // 相对于关卡开始的时间（秒）
    spawns: EnemySpawnConfig[];
}

// Boss 配置
export interface BossConfig {
    type: EnemyType; // 通常为 EnemyType.Boss 或某精英类型
    resource: EnemyResource;
    appearTime?: number; // 出现时间（秒），不设置则由波次或关卡逻辑决定
    hpMultiplier?: number; // 生命倍率（相对基础表）
    drops?: EnemyDropItem[]; // Boss 专属掉落
}

// 关卡基础信息
export interface LevelInfo {
    bgScrollSpeed: number;   // 背景滚动速度
    layers: number;          // 背景层数（用于视差）
    initialMeteorCount: number; // 初始陨石数量
}

// 关卡内可触发的事件类型
export enum LevelEventType {
    Dialogue = 'Dialogue',
    BgmChange = 'BgmChange',
    ScreenShake = 'ScreenShake',
    SpawnItem = 'SpawnItem',
    Script = 'Script',
    Custom = 'Custom'
}

// 各类事件的负载定义（可按需扩展）
export interface DialogueEventPayload {
    speaker?: string;
    text: string;
    portrait?: string; // 立绘资源
}

export interface BgmChangeEventPayload {
    bgm: string;      // BGM 名称或资源路径
    loop?: boolean;
    volume?: number;  // 0~1
    fadeTime?: number; // 秒
}

export interface ScreenShakeEventPayload {
    duration: number; // 秒
    amplitude: number; // 幅度
    frequency?: number; // 频率
}

export interface SpawnItemEventPayload {
    itemType: DropType;
    count?: number;
    position?: { x: number; y: number }; // 世界坐标或由系统解释
}

export interface ScriptEventPayload {
    name: string;           // 脚本/触发器名称
    args?: Record<string, any>;
}

export interface CustomEventPayload {
    key: string;            // 自定义键
    data?: Record<string, any>;
}

export type LevelEventPayload =
    | DialogueEventPayload
    | BgmChangeEventPayload
    | ScreenShakeEventPayload
    | SpawnItemEventPayload
    | ScriptEventPayload
    | CustomEventPayload;

// 基础事件定义
export interface LevelEventBase {
    time: number;           // 发生时间（秒），相对关卡开始
    type: LevelEventType;
}

export type LevelEvent = LevelEventBase & {
    payload?: LevelEventPayload;
};

// 关卡数据实体
export class LevelData {
    readonly levelId: number;
    readonly info: LevelInfo;
    readonly enemyResources: Record<string, EnemyResource>;
    readonly waves: WaveConfig[];
    readonly boss?: BossConfig;
    readonly defaultDrops?: EnemyDropItem[]; // 全局默认掉落表（可被局部覆盖）
    readonly events: LevelEvent[]; // 关卡时间轴事件

    constructor(params: {
        levelId: number;
        info: LevelInfo;
        enemyResources?: Record<string, EnemyResource>;
        waves?: WaveConfig[];
        boss?: BossConfig;
        defaultDrops?: EnemyDropItem[];
        events?: LevelEvent[];
    }) {
        this.levelId = params.levelId;
        this.info = params.info;
        this.enemyResources = params.enemyResources ?? {};
        this.waves = params.waves ?? [];
        this.boss = params.boss;
        this.defaultDrops = params.defaultDrops;
        this.events = (params.events ?? []).slice().sort((a, b) => a.time - b.time);
    }

    static createDefault(levelId: number): LevelData {
        return new LevelData({
            levelId,
            info: { bgScrollSpeed: 1.0, layers: 3, initialMeteorCount: 5 },
            enemyResources: {},
            waves: [],
            events: [],
        });
    }

    static fromJSON(json: any): LevelData {
        // 简单的容错解析，可按需增强校验
        return new LevelData({
            levelId: Number(json.levelId ?? 1),
            info: {
                bgScrollSpeed: Number(json.info?.bgScrollSpeed ?? 1.0),
                layers: Number(json.info?.layers ?? 3),
                initialMeteorCount: Number(json.info?.initialMeteorCount ?? 5),
            },
            enemyResources: json.enemyResources ?? {},
            waves: json.waves ?? [],
            boss: json.boss,
            defaultDrops: json.defaultDrops,
            events: (json.events ?? []).map((e: any) => ({
                time: Number(e.time ?? 0),
                type: String(e.type ?? LevelEventType.Custom) as LevelEventType,
                payload: e.payload,
            })),
        });
    }

    // 实用查询方法：在某时间段内的事件
    getEventsInRange(startTime: number, endTime: number): LevelEvent[] {
        if (endTime < startTime) return [];
        // events 已按 time 排序，做一次线性筛选即可
        return this.events.filter(e => e.time >= startTime && e.time <= endTime);
    }

    // 获取指定时间点（允许误差）的事件
    getEventsAtTime(time: number, epsilon: number = 1e-3): LevelEvent[] {
        const tMin = time - epsilon;
        const tMax = time + epsilon;
        return this.getEventsInRange(tMin, tMax);
    }
}

