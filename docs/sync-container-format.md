# MoneyBrain 加密容器格式（formatVersion 1）

> 状态：**暂定**。跨端收敛已验证通过，真机初始化开销仍待 [roadmap.md](roadmap.md) §3 的 V3 spike；
> 两者齐备后 `formatVersion = 1` 才冻结。冻结前允许改字节布局，冻结后任何结构变化都必须升
> `formatVersion`，旧版本整批拒绝。
>
> 什么时候看：改备份/同步容器、写独立解密工具、或排查「容器打不开」时。
> 唯一实现：`packages/sync/src/container.ts`。备份与同步共用这一份实现，禁止第二份加密代码。
> 本文是给「项目外」读者用的：按本文参数 + [scripts/decrypt-container.mts](../scripts/decrypt-container.mts)
> 能独立解开一份容器，不依赖本仓库的加密模块。

## 1. 文件

- 扩展名 `.mbx`；Magic 为 ASCII `MBSYNC01`（8 字节）。
- 全文件一个 AEAD：header 之后的所有字节一次加密、一个认证标签。截断 / 篡改 / 半写都表现为标签校验失败，**整批拒绝**。

```
offset 0           8 bytes   magic = "MBSYNC01"
offset 8           4 bytes   uint32 **big-endian**：headerLength
offset 12          N bytes   header（UTF-8 JSON，长度 = headerLength）
offset 12+N        M bytes   ciphertext（负载明文加密后的字节）
offset 12+N+M      16 bytes  Poly1305 tag
```

## 2. Header

```json
{
  "formatVersion": 1,
  "ledgerId": "0f3a…-uuid",
  "kdf": {
    "algorithm": "argon2id",
    "t": 3,
    "m": 65536,
    "p": 1,
    "dkLen": 32,
    "salt": "<base64url, 16 字节>"
  },
  "cipher": {
    "algorithm": "xchacha20-poly1305",
    "nonce": "<base64url, 24 字节>"
  }
}
```

- `formatVersion` 未知 → 解密前直接拒绝（不是「尽力解析」）。
- `ledgerId`：账本实例 UUID，绑定 AAD，防跨账本重放。同步应用必须与本机 `ledgerId` 比对；
  **换设备恢复备份时不校验**（新设备的账本身份就是从这份备份来的）。
- `kdf.m` 单位 KiB；`t`/`m`/`p` 必须落在实现允许范围（`t 1–10`、`m 8–1048576`、`p 1–8`、`dkLen = 32`）。
- `salt` / `nonce` 用 base64url（RFC 4648 §5，无 padding）。

## 3. 密钥派生

```
recoveryCode  = 用户抄写的 32 位 Base32（字母表 A–Z2–7），去掉空格与连字符、统一大写
key           = Argon2id(UTF8(recoveryCode), salt, t, m, p, dkLen = 32)
```

- 恢复码由系统生成：20 字节随机（160 位熵）→ Base32（32 字符）→ 每 4 位分组显示
  （`XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`）。用户不自选口令。
- Argon2id 必须使用 **Argon2id** 变体（不是 Argon2i / Argon2d），输出原始 32 字节，
  **不再做 HKDF / SHA 等二次处理**。

## 4. AEAD

`XChaCha20-Poly1305` = HChaCha20 子密钥 + IETF ChaCha20-Poly1305：

```
subkey    = HChaCha20(key, nonce[0..16))
ietfNonce = 0x00000000 || nonce[16..24)      # 前 4 字节为零
ciphertext+tag = ChaCha20-Poly1305-IETF(subkey, ietfNonce, aad, plaintext)
```

- HChaCha20 常量：`61707865 3320646e 79622d32 6b206574`；密钥 32 字节；输入 nonce 16 字节；
  20 轮（10 次双轮）；输出 `state[0..4)` 与 `state[12..16)` 共 32 字节。
- 所有 32 位字按 little-endian 读写。
- 认证标签 16 字节，附在 ciphertext 尾部。
- AAD（UTF-8）：`"${formatVersion}|${ledgerId}"`，例如 `1|0f3a…`。
- 明文为 UTF-8 JSON：`{"records":[ … ]}`。

## 5. 记录

```json
{
  "entityType": "transaction",
  "entityId": "uuid",
  "rev": 3,
  "vv": "{\"device-a\":2,\"device-b\":3}",
  "deletedAt": null,
  "data": { }
}
```

运行时校验（任一条不合法 → **整批拒绝**，不部分应用）：

- `entityType` 非空、≤ 64 字符、不含 NUL；`entityId` 非空、≤ 128 字符、不含 NUL。
- `rev` 为 ≥ 1 的整数。
- `vv` 为 JSON 对象字符串，至少一维；每维为正整数；写入时按键名升序规范化。
- `deletedAt` 为 `null` 或可解析时间字符串。
- `data` 必须是 JSON 对象，且**不得包含** `rev` / `vv` / `deletedAt`。
- `data` 递归只允许 JSON 值（字符串、有限数字、布尔、null、数组、对象）。

**本地字段不进容器**：`investmentSnapshot` 的 `previousSnapshotId` 属于本地快照链，
`sealContainer` 封容器前剔除，`openContainer` 经 `normalizeInboundRecords` 入站再剔除一次。
应用后按「账户 → 日期 → createdAt → id」由 `apps/api` 的 `relinkSnapshots` 统一重算；
该写入只改派生字段，不推进 `rev` / `vv`。

**未知 `entityType`**：只跳过该条并警告，已识别实体照常合并——这与未知
`formatVersion` 的「整批拒绝」是两个层级。新增实体类型不需要改合并算法。

## 6. 参考解密

```bash
# 恢复码可直接传参，或放在 MONEYBRAIN_RECOVERY_CODE 环境变量里
npm run sync:decrypt -- path/to/backup.mbx XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
```

脚本 [scripts/decrypt-container.mts](../scripts/decrypt-container.mts) 不 import 本仓库的
`packages/sync`，只用 Node 内置 `crypto` 与 `@noble/hashes/argon2`，按本文实现 HChaCha20；
输出容器头与记录 JSON。把它单独复制到项目外，也应当能解开同一份容器。

## 7. 安全边界

- ✅ 防：网盘 / 云服务商 / 传输窃听 / 备份被复制 / 仓库泄露。
- ❌ 不防：设备解锁后的本地明文 SQLite、键盘记录、用户主动交出恢复码。
- 元数据仍泄露：文件名、设备数、文件大小、修改时间、同步频率。
- 错误恢复码与损坏文件统一报「恢复码不正确，或容器文件已损坏」，不区分原因。
