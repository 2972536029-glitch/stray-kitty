export interface ClientDiagnostic {code: string; message: string; requestId?: string}
// 当前只提供本地诊断出口，不上传玩家内容或令牌。
export function reportDiagnostic(value: ClientDiagnostic): void {
  console.warn('[stray-kitty]', {code:value.code,message:value.message,requestId:value.requestId});
}
