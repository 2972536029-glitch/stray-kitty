/* ============================================
   小猫回家记 · Datadog RUM 接入(可插拔)
   --------------------------------------------
   使用方法:在 index.html 的模块脚本之前注入
     window.KITTY_RUM = {
       applicationId: "<RUM Application ID>",
       clientToken:   "<RUM Client Token>",
       site: "datadoghq.com", env: "dev", version: "0.1.0",
     };
   没有配置时本文件 no-op,游戏照常运行(与后端 obs 包同一纪律)。
   RUM 开启后自动采集 Page Load / User Action / Error / 资源 / 长任务,
   并给同源 /api/ 请求注入 traceparent(W3C)——后端
   DD_TRACE_PROPAGATION_STYLE=tracecontext,datadog 会延续这条 trace,
   玩家操作可一路串到 kitty-api → kitty-paymentd 的后端链路。
   SDK 用 npm 打包而非官方 CDN:CDN 域名在国内网络不可达(旅行牛牛验证过的坑)。
   ============================================ */

interface KittyRumConfig {
  applicationId: string;
  clientToken: string;
  site?: string;
  env?: string;
  version?: string;
}

declare global {
  interface Window {
    KITTY_RUM?: KittyRumConfig;
    DD_RUM?: unknown;
  }
}

/** 生产环境判断:决定是否脱敏展示(当前前端无 trace 展示需求,预留) */
export function isProductionEnv(): boolean {
  return window.KITTY_RUM?.env === 'production';
}

export async function initRUM() {
  const cfg = window.KITTY_RUM;
  if (!cfg || !cfg.applicationId || !cfg.clientToken) {
    console.info('[kitty-rum] 未配置 window.KITTY_RUM,RUM 关闭(游戏不受影响)');
    return;
  }
  try {
    // 动态 import:SDK 单独分包,不配置 RUM 时这份代码不会拖慢首包
    const {datadogRum} = await import('@datadog/browser-rum');
    datadogRum.init({
      applicationId: cfg.applicationId,
      clientToken: cfg.clientToken,
      site: cfg.site || 'datadoghq.com',
      service: 'kitty-frontend',
      env: cfg.env || 'dev',
      version: cfg.version || '0.1.0',
      sessionSampleRate: 100,
      sessionReplaySampleRate: 20,
      trackUserInteractions: true,
      trackResources: true,
      trackLongTasks: true,
      defaultPrivacyLevel: 'mask-user-input',
      // 前后端 trace 关联:三个 API base(/api/v1、/api/payment、/api/auth)都在 /api/ 下
      allowedTracingUrls: [{match: /\/api\//, propagatorTypes: ['tracecontext']}],
    });
    datadogRum.startSessionReplayRecording();
    console.info('[kitty-rum] RUM 已启动(service=kitty-frontend, 本地打包 SDK)');
  } catch (e) {
    console.warn('[kitty-rum] RUM SDK 加载失败(游戏不受影响)', e);
  }
}
