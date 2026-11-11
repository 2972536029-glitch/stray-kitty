"""Synthesize per-skill cast sound effects for the tower-defense battles.

Each of the 8 castable skills gets a short cue designed from its name and
board effect: shield clangs, triple claw whooshes, bell + frost shimmer,
star arpeggio, warm purr heal, night swell, lantern sweep. Outputs mono
16-bit WAV (24 kHz) into web/src/modules/battle/assets/skills/.

Rerun after tuning: python scripts/synthesize-skill-sfx.py
"""
import wave
from pathlib import Path

import numpy as np

RATE = 24000
DEST = Path(__file__).resolve().parents[1] / "web/src/modules/battle/assets/skills"

def envelope(n, attack=0.008, release=0.25):
    t = np.arange(n) / RATE
    env = np.ones(n)
    a = max(1, int(attack * RATE))
    env[:a] = np.linspace(0, 1, a)
    r = max(1, int(release * RATE))
    if r < n:
        env[-r:] *= np.linspace(1, 0, r)
    return env

def decay(n, k=6.0):
    return np.exp(-k * np.arange(n) / RATE)

def place(canvas, sound, at):
    i = int(at * RATE)
    end = min(len(canvas), i + len(sound))
    canvas[i:end] += sound[: end - i]

def bell(freq, dur, k=5.0, partials=((1.0, 1.0), (2.76, 0.55), (5.4, 0.30), (8.9, 0.16))):
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    s = np.zeros(n)
    for ratio, amp in partials:
        s += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-k * ratio * t / 1.6)
    return s

def whoosh(dur, f_start=700, f_end=2800, q=4.0):
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    noise = np.random.default_rng(len(t)).standard_normal(n)
    center = np.linspace(f_start, f_end, n)
    phase = np.cumsum(2 * np.pi * center / RATE)
    carrier = np.sin(phase)
    # Narrowband noise around a sweeping center: ring-modulated noise.
    s = noise * (0.55 + 0.45 * np.sin(phase * 0.5))
    b = np.exp(-((t - dur * 0.45) ** 2) / (2 * (dur * 0.28) ** 2))
    return s * b * envelope(n, 0.02, dur * 0.3)

def lowpass(x, alpha):
    out = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        out[i] = acc
    return out

def metal_clang(freq, dur, boom=110.0):
    n = int(dur * RATE)
    clang = bell(freq, dur, k=7.0, partials=((1.0, 1.0), (1.62, 0.7), (2.94, 0.5), (4.83, 0.3), (7.1, 0.18)))
    thud = np.sin(2 * np.pi * boom * np.arange(n) / RATE) * np.exp(-9 * np.arange(n) / RATE)
    return clang * 0.9 + thud * 0.5

def finish(canvas, peak=0.85):
    s = np.asarray(canvas, dtype=np.float64)
    s = np.tanh(s * 1.2)
    top = np.max(np.abs(s)) or 1.0
    return (s / top * peak * 32767).astype(np.int16)

def write(name, canvas):
    DEST.mkdir(parents=True, exist_ok=True)
    path = DEST / name
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(finish(canvas).tobytes())
    print(f"{path.name}: {len(canvas)/RATE:.2f}s {path.stat().st_size//1024}KB")

rng = np.random.default_rng(42)

# 罐盖护盾 — metal lid clang with a low thud.
n = int(0.55 * RATE)
write("guard-shield-clang.wav", metal_clang(430, 0.55, boom=120))

# 栗盾奋击 — heavier slam, lower clang plus a chest-level boom.
n = int(0.7 * RATE)
slam = metal_clang(300, 0.7, boom=70)
boom = np.sin(2 * np.pi * 55 * np.arange(n) / RATE) * np.exp(-7 * np.arange(n) / RATE)
write("bruiser-fury-slam.wav", slam * 0.95 + boom * 0.6)

# 橘影连爪 — three fast claw whooshes, rising pitch.
n = int(0.62 * RATE)
c = np.zeros(n)
for i, (f0, f1) in enumerate([(600, 2200), (800, 3000), (1000, 3800)]):
    place(c, whoosh(0.16, f0, f1) * (0.8 + 0.2 * i), i * 0.21)
write("tuanzi-claw-swipe.wav", c)

# 银铃缓行 — urgent bell shakes plus a frosty shimmer tail.
n = int(0.95 * RATE)
c = np.zeros(n)
for i in range(3):
    place(c, bell(2350, 0.28, k=8.0) * 0.8, i * 0.15)
shimmer = rng.standard_normal(n) * np.exp(-4 * np.arange(n) / RATE) * np.linspace(0.2, 1.0, n)
shimmer = shimmer - lowpass(shimmer, 0.35)  # keep the icy high end only
place(c, shimmer * 0.5, 0.45)
write("controller-slow-bell.wav", c)

# 星绒绽放 — rising bell arpeggio with sparkle pings.
n = int(0.9 * RATE)
c = np.zeros(n)
for i, f in enumerate([1047, 1319, 1568, 2093]):  # C6 E6 G6 C7
    place(c, bell(f, 0.3, k=6.5) * (1.0 - i * 0.12), i * 0.11)
for i in range(5):
    f = rng.choice([3136, 3520, 4187])
    place(c, bell(f, 0.12, k=14.0) * 0.35, 0.5 + i * 0.07)
write("caster-star-burst.wav", c)

# 安心呼噜 — warm rising triad with a purr-like tremolo.
n = int(0.8 * RATE)
c = np.zeros(n)
tremolo = 0.75 + 0.25 * np.sin(2 * np.pi * 26 * np.arange(n) / RATE)
for i, f in enumerate([523, 659, 784]):  # C5 E5 G5
    seg = np.sin(2 * np.pi * f * np.arange(int(0.3 * RATE)) / RATE) * envelope(int(0.3 * RATE), 0.04, 0.18)
    place(c, seg * tremolo[: len(seg)], i * 0.14)
write("diandian-heal-purr.wav", lowpass(c, 0.5))

# 夜视护行 — dark swell blooming into a faint glimmer.
n = int(0.9 * RATE)
t = np.arange(n) / RATE
swell = lowpass(rng.standard_normal(n), 0.06) * np.linspace(0.2, 1.0, n) ** 2
body = np.sin(2 * np.pi * 130 * t) * np.linspace(0.1, 0.55, n) * np.exp(-2.2 * t)
glint = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in (2960, 3729, 4435))
glint = glint / 3 * np.sin(np.pi * t / 0.9) ** 2 * 0.22
write("momo-night-swell.wav", swell * 0.5 + body + glint * np.linspace(0.3, 1.0, n))

# 巡光护行 — lantern flame sweep then brittle shatter bursts.
n = int(0.85 * RATE)
c = np.zeros(n)
place(c, whoosh(0.34, 400, 2400) * 1.1, 0.0)
for i in range(3):
    m = int(0.06 * RATE)
    crack = (rng.standard_normal(m) - lowpass(rng.standard_normal(m), 0.2)) * np.exp(-40 * np.arange(m) / RATE)
    place(c, crack * (0.9 - 0.18 * i), 0.38 + i * 0.09)
write("momo-cleanse-lantern.wav", c)
