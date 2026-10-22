# Кадры 3D-подарка (режим «как у Apple»)

Если видеокарта не тянет живой WebGL (нет GPU, браузер сбрасывает контекст,
меньше 30 кадров/с, мало памяти), подарки показываются заранее отрендеренными
кадрами из `public/gift-frames/`. Кадры рендерит **тот же** `GiftRenderer`,
поэтому выглядят так же, как живое 3D.

Подарок в шапке (не крутится руками, просто вращается) в Chromium-браузерах
показывается бесшовным видео `loop-red.webm` (VP9 с прозрачностью) — оно идеально
плавное. В остальных браузерах — те же спрайты.

Перезапекать нужно только если поменялся внешний вид подарка
(геометрия, шейдеры, цвета в `src/gl/giftRenderer.ts` / `giftPhysics.ts`).

## Как перезапечь

Нужно: Python 3 с `playwright` (`pip install playwright && playwright install chromium`),
`sharp` (`npm i -D sharp`) и `ffmpeg` с libvpx-vp9 в PATH (для видео-петли).

```bash
cd frontend
npm run dev                                   # в отдельном терминале
python scripts/gift-frames/bake.py            # ~20 мин: PNG-кадры в scripts/gift-frames/frames/
node scripts/gift-frames/pack.mjs             # WebP-спрайты и видео-петля в public/gift-frames/ + src/gl/giftFramesData.ts
```

Папку `scripts/gift-frames/frames/` коммитить не нужно.

## Проверка режимов в браузере

- `?gifts=frames` — всегда кадры; `?gifts=webgl` — всегда живой WebGL;
  `?gifts=auto` — снова автоматически (выбор запоминается в localStorage).
- После сброса WebGL-контекста устройство 3 дня показывает кадры
  (ключ `santa:gpu-lost-at` в localStorage); `?gifts=webgl` — проверить 3D снова.
