# Inventory Scan       

App frontend offline-first (kho / POS / cân) — Vue 3, Capacitor 7, PrimeVue 4.

| | |
|---|---|
| App ID | `com.srcvip.app` |
| Platforms | Web, Android (`android/` đã có trong repo) |
| Node | 22+ |
| Data | SQLite trên disk (native) / sql.js + OPFS (web). **Không dùng Dexie / IndexedDB.** |

## Yêu cầu

- Node.js 22
- Android Studio + JDK 21 (khi build native)
- Chrome (Web Serial / Web NFC trên desktop)

## Cài đặt & chạy

Hai luồng **tách nhau**. `npm run dev` không đưa code vào APK; `cap:sync` không phải server treo song song với Vite.

**Web (Chrome trên PC)** — giữ terminal chạy:

```bash
npm install
npm run dev
```

Mở [http://localhost:5173](http://localhost:5173). Sửa Vue/TS là HMR ngay.

**App trên máy (tablet / phone)** — lệnh xong là thoát, không hot-reload:

```bash
npm run cap:sync
npm run cap:android
```

Rồi Run APK trong Android Studio. `cap:sync` đã gồm `npm run build` (copy `dist/` vào `android/`). Mỗi lần muốn thấy code mới trên máy: sync lại rồi Run lại.

Label Web / Tablet / Mobile trên login chỉ theo độ rộng màn hình — cùng một APK.

| Script | Việc |
|---|---|
| `npm run dev` | Vite `http://localhost:5173` (web) |
| `npm run build` | Typecheck + `dist/` (deploy web hoặc dùng cho sync) |
| `npm run cap:sync` | Build + `npx cap sync` |
| `npm run cap:android` | Mở Android Studio |

Vite chọn API URL theo mode:

| File | Lệnh | URL mặc định |
|---|---|---|
| `.env.development` | `npm run dev` | `http://localhost:3000` |
| `.env.production` | `npm run build` / `cap:sync` | `http://10.0.111.127:7283` |

Override máy local (gitignored): `.env.development.local` chỉ đè `npm run dev`; `.env.local` đè mọi mode (kể cả `build` / `cap:sync`). Copy key từ `.env.example`.

`http.ts` lấy `settings.current.apiUrl` (default từ `VITE_API_URL`). URL sửa được trong **Cài đặt** (lưu SQLite). Trên **native**, `localhost` / `127.0.0.1` bị bỏ — đó là chính máy Android, không phải PC.

API hiện tại là **HTTP**. Capacitor dùng `androidScheme: 'http'` để tránh Mixed Content (`https://localhost` không được gọi `http://…`). Khi API đã HTTPS, đổi `.env.production` sang `https://…` **và** `androidScheme: 'https'` rồi `cap:sync` lại.

Backend CORS (có credentials thì không dùng `*`) cần cho:

- `http://localhost:5173` — Vite
- `http://localhost` — APK (`androidScheme: 'http'`)
- domain web production khi deploy `dist/`
- IP LAN Vite nếu mở từ máy khác (`http://10.x.x.x:5173`)

Không set `server.url` (live-reload) trong bản release — APK đọc file trong `dist/`, origin vẫn `http://localhost`.

## Tính năng

- CRUD sản phẩm offline-first, queue `outbox`, đẩy API khi online
- Quét QR / barcode / NFC
- Cân điện tử qua USB Serial hoặc Bluetooth LE
- Chụp ảnh, quay video → file disk; SQLite chỉ lưu path
- Export Excel / CSV / PDF, backup JSON
- i18n: Tiếng Việt (mặc định), English, 繁體中文 (`zh-TW`)

## Lưu trữ

| Nơi | Nội dung |
|---|---|
| Native SQLite (`Library` / app data, không `Caches`) | Bảng nghiệp vụ, outbox, settings |
| Web OPFS `db/srcvip.db` | Cùng schema, không IndexedDB |
| `Directory.Data` / OPFS `media/` | Ảnh, video |
| `Documents/Inventory Scan/` | Backup JSON (web: download) |
| Pinia | UI / online — không persist bảng hàng |

## Hardware

| Kênh | Ghi chú |
|---|---|
| USB Serial | Chrome desktop (`navigator.serial`). Android USB host cần plugin serial riêng |
| Bluetooth LE | UUID Service / Characteristic trong Cài đặt |
| Bluetooth Classic SPP | Cân cũ — Android plugin; **không có trên iOS** |
| NFC | Native plugin; Web NFC trên Chrome Android |
| Camera | Chụp + quay (MediaRecorder) |

## Đồng bộ API

Khi online, outbox gọi:

- `POST`
- `PUT`
- `DELETE`

CRUD vẫn chạy khi API chưa có; lệnh nằm outbox.

## i18n

Chọn ngôn ngữ trên thanh trên hoặc Cài đặt (lưu SQLite).

Fallback key thiếu: `zh-TW` → `vi` → `en`. Mặc định UI: `vi`.

## Android / CI

Thư mục `android/` đã có. Không chạy lại `npx cap add android`.

**Production không phải chỉ 3 lệnh này.** Chúng build APK; web deploy `dist/` là bước riêng.

| Kênh | Lệnh | Ghi chú |
|---|---|---|
| Web production | `npm run build` → copy `dist/` lên IIS/nginx | CORS cho **domain web** |
| App production | `npm run cap:sync` rồi build APK/AAB (Studio hoặc CI) | Bake `VITE_API_URL` từ `.env.production`. Không có “link server” live-reload |

```bash
npm run cap:sync
npm run cap:android
```

iOS: chỉ trên macOS — `npx cap add ios`.

Push `main` hoặc **Actions → inventory-scan-android** build APK + AAB.

Secrets:

| Secret | |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w 0 srcvip-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | |
| `ANDROID_KEY_ALIAS` | |
| `ANDROID_KEY_PASSWORD` | |

`versionCode` = số commit + `VERSION_CODE_BASE` (1). Artifact giữ 7 ngày.

## Quyền native

Camera, Microphone, NFC, Bluetooth, USB host, Internet, Network state.

iOS NFC cần entitlement Tag Reader + `NFCReaderUsageDescription`.