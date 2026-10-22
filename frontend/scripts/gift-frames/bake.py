import asyncio, base64, os, sys, json
from playwright.async_api import async_playwright
import pathlib
HERE = pathlib.Path(__file__).resolve().parent
OUT = str(HERE / 'frames')
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:5173/scripts/gift-frames/bake.html'
SS = 2  # supersampling
W, H = 672, 640
JOBS = [(k, t, n) for t in ('red', 'green', 'graphite') for (k, n) in (('turn', 48), ('open', 20))] + [('loop', 'red', 857)]  # 30 fps × 2π/0.22 s
only = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != 'all' else None
async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width': 800, 'height': 600}, device_scale_factor=1)
        pg.on('console', lambda m: print('console', m.type, m.text[:200]))
        pg.on('pageerror', lambda e: print('PAGEERR', e))
        await pg.goto(URL); await pg.wait_for_function('typeof window.bake === "function"')
        for kind, tone, n in JOBS:
            if only and only != f'{kind}-{tone}' and only != 'pile' : continue
            if only == 'pile': break
            d = f'{OUT}/{kind}-{tone}'; os.makedirs(d, exist_ok=True)
            for start in range(0, n, 40):  # batches: a PNG data URL per frame adds up fast
                urls = await pg.evaluate('([j,w,h]) => window.bake(j,w,h)', [{'kind': kind, 'tone': tone, 'frames': n, 'start': start, 'count': 40}, W * SS, H * SS])
                for i, u in enumerate(urls):
                    open(f'{d}/{start + i:04d}.png', 'wb').write(base64.b64decode(u.split(',')[1]))
            print('done', kind, tone, n, flush=True)
        if not only or only == 'pile':
            u = await pg.evaluate('() => window.bakePile(2400, 820, 16, 18)')
            open(f'{OUT}/pile.png', 'wb').write(base64.b64decode(u.split(',')[1]))
            print('done pile')
        await b.close()
asyncio.run(main())
