# Xsolla 沙盒支付接入(paymentd)

版本:2026-10-28|状态:代码与测试就绪,等待 Publisher Account 凭据|对应 issue:!9

## 形态与边界

- **双形态,凭据驱动**:paymentd 配了 Xsolla 凭据(`XSOLLA_MERCHANT_ID/PROJECT_ID/API_KEY`)即走 Xsolla 沙盒;没配则维持 mock(4242/0000 演示卡),行为与历史版本完全一致,CI/本地零感知。
- **只接沙盒**:XSOLLA_SANDBOX 默认 true,不签 licensing agreement,不发生真实扣款。
- **前端不发货**(PRD §4):返回页只读轮询流水;发货只走 `webhook → paymentd 落账 → 游戏侧 /internal/credit` 链路。
- **单进程形态不支持 Xsolla**:Xsolla 只在拆分部署(paymentd 独立进程)下提供,`PAYMENT_URL` 未设置时游戏 API 用进程内 mock。

## 支付链路(跳转形态)

```
前端充值弹窗
  → GET /api/payment/config        (mock=卡号 UI / xsolla=跳转 UI)
  → POST /api/payment/session      {playerId, packId}
  → 游戏API → paymentd POST /internal/session
  → paymentd → Xsolla 商户API POST /merchant/v2/merchants/{id}/token (Basic 鉴权)
  ← 返回 sandbox-secure.xsolla.com/paystation4/?token=…   (external_id=xs-* 流水号,
     custom_parameters 捎带 playerId/packId)
前端整页跳转收银台 → 用户用官方测试卡支付 → 支付完成跳回 ?payment=return
Xsolla → POST /xsolla-webhook (nginx 精确反代到 paymentd /webhook/xsolla)
  → 验签 Authorization: Signature sha1(body+webhookSecret)
  → 幂等落账 RecordIfNew(重复通知不重复落账,但仍重试入账)
  → 回调游戏 API POST /internal/credit(INTERNAL_TOKEN 门禁 + 同号流水去重,不双发)
  → 回 200;入账失败回 502 让 Xsolla 重试兜底
```

退款(refund)通知当前只留痕不动余额(演示范围,上线前需补扣回逻辑)。

## 配置一览

| 环境变量(paymentd) | 说明 |
| --- | --- |
| `XSOLLA_MERCHANT_ID` / `XSOLLA_PROJECT_ID` / `XSOLLA_API_KEY` | Publisher Account 凭据;三项齐备即启用 xsolla |
| `XSOLLA_WEBHOOK_SECRET` | 项目设置 > Webhooks 的签名密钥(不是 API key) |
| `XSOLLA_SANDBOX` | 默认 `true`;签协议收真实款前不要改 |
| `XSOLLA_RETURN_URL` | 支付完回前端的地址(填 `http://<预览地址>/?payment=return`) |
| `XSOLLA_API_BASE_URL` / `XSOLLA_PAYSTATION_BASE_URL` | 仅测试注入假服务用,生产留空 |
| `GAME_INTERNAL_URL` | 游戏 API 集群内地址(webhook 回调入账用),如 `http://stray-kitty-game:8080` |
| `INTERNAL_TOKEN` | paymentd 与 game 共享的内部令牌,两边必须一致 |

游戏 API 侧:`INTERNAL_TOKEN` 未配置时 `POST /internal/credit` 整体关闭(404),不留无门禁的入账口。

## 本地跑通(mock 回落,无需任何凭据)

```bash
# 终端 1:支付服务(mock)
cd server && PAYMENT_ADDR=127.0.0.1:8082 go run ./cmd/paymentd
# 终端 2:游戏 API(远程网关形态)
cd server && PAYMENT_URL=http://127.0.0.1:8082 GAME_INTERNAL_URL=http://127.0.0.1:8017 INTERNAL_TOKEN=dev-token go run ./cmd/api
```

## 预览环境启用沙盒(haozhe preview)

```bash
# 1. 注入凭据 secret(optional 引用,不建 secret 则维持 mock)
kubectl -n cn-haozhe-wang create secret generic stray-kitty-preview-xsolla \
  --from-literal=merchant-id='<商户ID>' \
  --from-literal=project-id='<项目ID>' \
  --from-literal=api-key='<API key>' \
  --from-literal=webhook-secret='<Webhooks密钥>' \
  --from-literal=return-url='http://<预览地址>/?payment=return' \
  --from-literal=internal-token="$(openssl rand -hex 16)"
# 2. 重建 preview(payment 部署会带上 XSOLLA_* 环境变量)
# 3. Publisher Account 项目设置 > Webhooks:
#    处理程序 URL 填 http://<预览地址>/xsolla-webhook,启用 payment / refund 通知
```

## 沙盒演示脚本(汇报用)

1. 游戏内打开"金枪鱼补给小站",确认显示 Xsolla 沙盒文案与"前往沙盒收银台"按钮;
2. 选一档,跳转 PayStation 沙盒页,用任意测试卡(如 4242 0000 0000 0008,未来日期,CVV 任意;US 卡填 ZIP 12345)完成支付;
3. 自动跳回游戏,返回页轮询数秒后展示"到账啦";钱包余额与流水(来源 `Xsolla 沙盒收款`)同步更新;
4. 刷新页面,余额仍在(webhook 已落存档)。
欺诈拦截场景演示:测试卡 `5159 0848 2552 8450`(Mastercard,12/40)触发 AFS 拒绝。

## 测试与已知边界

- `go test ./...` 覆盖:会话创建参数(sandbox/external_id/custom_parameters/金额)、验签(对/错/缺)、payment 通知落账与重放幂等、入账失败→502→重试补账、credit 门禁与双端去重。
- 已知边界:refund 不动余额;支付页为 Xsolla 托管(与像素风有视觉断层,headless 融合是后续可选项,见 issue !9);凭据未配置时整体回落 mock,演示不中断。
