// 小猫回家记 · 业务埋点统一封装(模块二)
// --------------------------------------------
// action 清单冻结于 docs/biz-obs-module2-plan.md §1——新增 action 先改文档再改这里。
// RUM 未初始化(window.DD_RUM 不存在)时全部 no-op,与 rum.ts 同一纪律:
// 观测永不影响游戏。

type ActionContext = Record<string, string | number | undefined>;

function track(name: string, ctx?: ActionContext): void {
  const rum = (window as unknown as { DD_RUM?: { addAction: (n: string, c?: Record<string, unknown>) => void } }).DD_RUM;
  if (!rum) return; // RUM 未启用:静默跳过
  try {
    rum.addAction(name, ctx ?? {});
  } catch {
    // 观测旁路绝不抛错
  }
}

/** 主界面点击"继续冒险"(引导转化漏斗第一步) */
export function trackContinueAdventure(): void {
  track("continue_adventure_click");
}

/** 序章走完、进入第一章(转化漏斗终点) */
export function trackChapter1Enter(): void {
  track("chapter1_enter");
}

/** 掷骰动画结束(动画时长,ms——数值由 RUM 统计分布) */
export function trackDiceRollDuration(durationMs: number): void {
  track("dice_roll_duration", { duration_ms: Math.round(durationMs) });
}

/** UI 卡点发生。node 取值见 docs/biz-obs-module2-plan.md(枚举待轩扬确认后冻结) */
export function trackUiBlocker(node: string): void {
  track("ui_blocker", { node });
}

/** 进入花房到成功打开"布置家园"面板的耗时(ms) */
export function trackHomePanelOpen(durationMs: number): void {
  track("home_panel_open_duration", { duration_ms: Math.round(durationMs) });
}

/** 教学关键步骤完成。step 枚举待齐雯确认后冻结 */
export function trackTutorialStep(step: string, durationMs: number): void {
  track("tutorial_step_done", { step, duration_ms: Math.round(durationMs) });
}

/** 引导结束后玩家实战中首次主动换位(教学通关≠学会了) */
export function trackFirstActiveMove(delayMs: number): void {
  track("first_active_move", { delay_ms: Math.round(delayMs) });
}

/** 充值入口曝光(位置枚举待余尧确认) */
export function trackRechargeEntryExpose(location: string): void {
  track("recharge_entry_expose", { location });
}

/** 充值入口被点击 */
export function trackRechargeEntryClick(location: string): void {
  track("recharge_entry_click", { location });
}

/** 玩法入口被使用。feature 枚举:home / lottery / shop / advisor */
export function trackFeatureEntry(feature: string): void {
  track("feature_entry_use", { feature });
}
