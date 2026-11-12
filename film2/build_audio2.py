"""Soundtrack + timeline for the new (feature tour) hook film.

0-2 s heartbeat + intro line; Omar's old "حاسس بيها؟" line; the new 13 lines (one file); 1.3 s of the Delta's
ground notes alone after line 08; the closing line from the old file, three voices aligned word by word.
"""
import json
import subprocess
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from align import dtw_map, wsola

FF = r"C:\Users\moham\AppData\Local\Microsoft\WinGet\Packages\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-N-124279-g0f6ba39122-win64-gpl\bin\ffmpeg.exe"
SR = 48000
OLD = r"C:\Users\moham\Desktop\presentation video.mp3"
NEW = r"C:\Users\moham\Desktop\final version.mp3"
SND = Path(r"E:\Nasa Giza\presentation\assets\sound")
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)


def load(p):
    raw = subprocess.run([FF, "-v", "error", "-i", str(p), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def sec(x): return int(round(x * SR))

def movavg(x, w):
    c = np.cumsum(np.concatenate([[0.0], x.astype(np.float64)]))
    out = (c[w:] - c[:-w]) / w
    pad = len(x) - len(out)
    return np.pad(out, (pad // 2, pad - pad // 2), mode="edge").astype(np.float32)

def fade(x, fi=0.01, fo=0.04):
    x = x.copy(); i, o = sec(fi), sec(fo)
    if i: x[:i] *= np.linspace(0, 1, i)
    if o: x[-o:] *= np.linspace(1, 0, o)
    return x


old, new = load(OLD), load(NEW)
# loudness match: new file to the old one
lvl = lambda x: np.sqrt(np.mean(x[np.abs(x) > 0.01] ** 2))
new *= lvl(old) / lvl(new)

INTRO = 2.0
O1_SRC = (0.0, 4.18)
O1_AT = INTRO
A_SRC = (0.0, 27.10); A_AT = 6.35
NOTES_AT, NOTES = A_AT + A_SRC[1] + 0.05, 1.3
B_SRC = (27.06, len(new) / SR); B_AT = NOTES_AT + NOTES + 0.05
ALL_AT = B_AT + (B_SRC[1] - B_SRC[0]) + 0.1
TAKES = [(45.80, 48.40), (48.40, 50.65), (50.65, 53.10)]

def trim(x):
    env = movavg(np.abs(x), 480); on = np.where(env > env.max() * 0.08)[0]
    return x[max(on[0] - sec(0.03), 0): min(on[-1] + sec(0.12), len(x))]

raw = [trim(old[sec(a):sec(b)]) for a, b in TAKES]
ref = raw[0]; level = np.sqrt(np.mean(ref ** 2)) + 1e-6
aligned = [ref] + [(lambda w: w * level / (np.sqrt(np.mean(w ** 2)) + 1e-6))(wsola(x, dtw_map(ref, x), len(ref))) for x in raw[1:]]
L_all = len(ref)
TOTAL = ALL_AT + L_all / SR + 1.4
n = sec(TOTAL)

def put(buf, x, at, g=1.0):
    a = sec(at); b = min(a + len(x), len(buf)); buf[a:b] += x[: b - a] * g

voice = np.zeros(n, np.float32)
put(voice, fade(old[sec(O1_SRC[0]):sec(O1_SRC[1])]), O1_AT)
put(voice, fade(new[sec(A_SRC[0]):sec(A_SRC[1])]), A_AT)
put(voice, fade(new[sec(B_SRC[0]):sec(B_SRC[1])]), B_AT)
lead, left, right = fade(aligned[0]) * .6, fade(aligned[1]) * .5, fade(aligned[2]) * .5
chL = np.zeros(n, np.float32); chR = np.zeros(n, np.float32)
put(chL, lead + left * 1.25 + right * .55, ALL_AT); put(chR, lead + left * .55 + right * 1.25, ALL_AT)
mono_all = lead + left + right
put(voice, mono_all, ALL_AT)

def film(src):  # new-file time -> film time
    return src + (A_AT if src < 27.06 else B_AT - B_SRC[0])

O, M, I = 1, 2, 3
lines = [
    ("O1", O, O1_AT, O1_AT + 4.18, "حاسس بيها؟ لأ؟ طبيعي... محدش حاسس."),
    ("L01", M, film(0.0), film(5.42), "جاكرتا بتهبط. مكسيكو سيتي بتهبط. وتركيا اتشقّت تلتمية كيلو!"),
    ("L02", I, film(5.42), film(9.16), "والدلتا عندنا؟ بتهبط لحد حداشر ملّي كل سنة."),
    ("L03", O, film(9.16), film(11.76), "ومحدش شايف ده... غير نيسار."),
    ("L04", M, film(11.76), film(15.98), "أندولا بتخلّي أي حد يشوفه، ويسمعه، ويفهمه."),
    ("L05", I, film(15.98), film(18.94), "شغّل داتا نيسار الحقيقية... كأنها فيلم."),
    ("L06", M, film(18.94), film(21.08), "شوف الزرع والمية من الفضاء."),
    ("L07", O, film(21.08), film(24.12), "افتح آخر صورة نيسار لأي حتة في العالم."),
    ("L08", I, film(24.12), film(27.05), "اسمع الأرض: كل سنتي... نوتة."),
    ("L09", M, film(27.07), film(29.60), "شوف البحر هيوصل لفين سنة ألفين ومية."),
    ("L10", O, film(30.06), film(32.50), "حرّك الأرض بإيدك في معمل التداخل."),
    ("L11", I, film(32.50), film(36.10), "لف العالم مع أسترويونت، واكتشف حكاية كل منطقة."),
    ("L12", M, film(36.10), film(38.86), "قارن زمان بالنهارده، بصور حقيقية."),
    ("L13", O, film(38.86), film(43.73), "وكل رقم ليه مصدر... ومختوم بتوقيته، محدش يقدر يغيّره."),
]
words_new = [w for s in json.load(open(OUT / "words.json", encoding="utf-8")) for w in s["words"]]
words_old = [w for s in json.load(open(OUT.parent / "hook" / "words.json", encoding="utf-8")) for w in s["words"]]
spk = np.zeros(n, np.int8)
timeline = []
for key, who, s0, s1, text in lines:
    if key == "O1":
        wt = [(w["s"] + O1_AT, w["e"] + O1_AT) for w in words_old if w["e"] <= 4.2]
    else:
        wt = [(film(w["s"]), film(w["e"])) for w in words_new if s0 - 0.05 <= film(w["s"]) and film(w["e"]) <= s1 + 0.05]
    timeline.append({"id": key, "who": who, "start": round(s0, 3), "end": round(s1, 3), "text": text, "wt": wt})
    spk[sec(s0):sec(s1)] = who
spk[sec(ALL_AT):sec(ALL_AT + L_all / SR)] = 4
timeline.append({"id": "ALL", "who": 4, "start": round(ALL_AT, 3), "end": round(ALL_AT + L_all / SR, 3), "text": "ودي أندولا... تعالوا نوريكم.", "wt": []})

# music bed (minor, brighter after the logo line), ducked
t = np.arange(n) / SR
def pad(freqs, amp):
    o = np.zeros(n, np.float32)
    for f in freqs:
        for d in (-0.6, 0, 0.7): o += np.sin(2 * np.pi * (f + d) * t + d) * amp
    return o
LOGO = lines[4][2]
x = np.clip((t - LOGO + .3) / 1.2, 0, 1)
bed = pad([110, 130.81, 164.81, 220], .012) * (1 - x) + pad([87.31, 130.81, 174.61, 220, 261.63], .011) * x
bed *= (0.75 + 0.25 * np.sin(2 * np.pi * .08 * t)) * np.clip((t - 1.6) / 1.5, 0, 1) * np.clip((TOTAL - t) / 1.2, 0, 1)
env = movavg(np.abs(voice), sec(.25)); env /= env.max() + 1e-6
bed *= 1 - .55 * np.clip(env * 4, 0, 1)

sfx = np.zeros(n, np.float32); rng = np.random.default_rng(7)
def whoosh(at, dur=1.0, amp=.13):
    m = sec(dur); k = np.linspace(0, 1, m)
    put(sfx, movavg(rng.standard_normal(m).astype(np.float32), 40) * np.sin(np.pi * k) ** 2 * amp, at)
def boom(at, amp=.5):
    m = sec(1.6); k = np.arange(m) / SR
    put(sfx, (np.sin(2 * np.pi * (55 * np.exp(-k * 1.5)) * k) * np.exp(-k * 2.6) * amp).astype(np.float32), at)
    put(sfx, (np.sin(2 * np.pi * 880 * k) * np.exp(-k * 3) * .05 + np.sin(2 * np.pi * 1318.5 * k) * np.exp(-k * 3.5) * .04).astype(np.float32), at + .02)
def tick(at, amp=.12):
    m = sec(.12); k = np.arange(m) / SR
    put(sfx, (np.sin(2 * np.pi * 1600 * k) * np.exp(-k * 45) * amp).astype(np.float32), at)
# whooshes on the three city jumps and on each feature cut
for at in (film(0.0) - .25, film(1.10) - .25, film(2.96) - .25): whoosh(at, .8, .12)
whoosh(lines[3][2] - .4, 1.4, .14)   # NISAR
boom(LOGO)
for k in range(5, 14): tick(lines[k][2])
whoosh(ALL_AT - .6, 1.2, .12); boom(ALL_AT + .1, .35)
hb = fade(load(SND / "ground-heartbeat.wav")[: sec(INTRO + .5)], .05, .5) * .9
put(sfx, hb, 0)
notes = load(SND / "ground-sinking-notes.wav")
put(sfx, fade(notes[sec(.3): sec(.3 + NOTES + .5)], .02, .4) * .85, NOTES_AT)
put(sfx, fade(notes[sec(2.0): sec(4.0)], .3, .6) * .2, NOTES_AT - 2.0)

a0 = sec(ALL_AT); a1 = a0 + L_all
base = voice.copy(); base[a0:a1] -= mono_all[: a1 - a0]
L = base + chL + bed + sfx; R = base + chR + bed + sfx
peak = max(np.abs(L).max(), np.abs(R).max()) + 1e-6
pcm = (np.clip(np.stack([L, R], 1) / peak * .89, -1, 1) * 32767).astype("<i2")
subprocess.run([FF, "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "loudnorm=I=-15:TP=-1.5:LRA=11", "-ar", str(SR), str(OUT / "mix.wav")], input=pcm.tobytes(), check=True)

fps = 30; hop = SR // fps
rms = [float(np.sqrt(np.mean(voice[i:i + hop] ** 2))) for i in range(0, n, hop)]; m = max(rms)
spkf = [int(np.bincount(spk[i:i + hop].astype(np.int64), minlength=5).argmax()) for i in range(0, n, hop)]
json.dump({"total": round(TOTAL, 3), "intro": INTRO, "logo": round(LOGO, 3), "notes": [round(NOTES_AT, 3), round(NOTES_AT + NOTES, 3)],
           "all": round(ALL_AT, 3), "cities": [round(film(0.0), 3), round(film(1.10), 3), round(film(2.96), 3)],
           "lines": timeline, "rms": [round(r / m, 3) for r in rms], "spk": spkf}, open(OUT / "timeline.json", "w", encoding="utf-8"), ensure_ascii=False)
print("total", round(TOTAL, 2), "all", round(ALL_AT, 2), "notes", round(NOTES_AT, 2))
for l in timeline: print(l["id"], l["start"], l["end"], len(l["wt"]))
