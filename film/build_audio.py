"""Build the Egyptian hook soundtrack from the team's voice file and write the film timeline.

Film timeline: 0-3 s intro text + heartbeat; voices O1..O3; 1.65 s of the Delta's ground notes alone; I2, M3;
the three takes of the last line layered together; a short hold. Also a soft synth bed (ducked) and a few SFX.
"""
import json
import subprocess
import sys
from pathlib import Path
import numpy as np

FF = r"C:\Users\moham\AppData\Local\Microsoft\WinGet\Packages\yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-N-124279-g0f6ba39122-win64-gpl\bin\ffmpeg.exe"
SR = 48000
VOICE = r"C:\Users\moham\Desktop\presentation video.mp3"
SND = Path(r"E:\Nasa Giza\presentation\assets\sound")
OUT = Path(sys.argv[1])


def load(p):
    raw = subprocess.run([FF, "-v", "error", "-i", str(p), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def sec(x):
    return int(round(x * SR))


v = load(VOICE)
INTRO = 3.0
NOTES = 1.65
# source ranges in the voice file
SEG1 = (0.0, 33.95)      # O1 M1 I1 O2 M2 O3
SEG2 = (33.90, 45.95)    # I2 M3
TAKES = [(45.80, 48.40), (48.40, 50.65), (50.65, 53.10)]  # the last line, three voices
OFF2 = INTRO + (SEG1[1] - SEG1[0]) + NOTES - SEG2[0]      # film = src + OFF2 for SEG2
ALL_AT = SEG2[1] + OFF2 + 0.15
TOTAL = ALL_AT + 2.6 + 1.6

n = sec(TOTAL)
voice = np.zeros(n, np.float32)
spk = np.zeros(n, np.int8)  # 1 omar, 2 mohamed, 3 islam, 4 all


def movavg(x, w):
    c = np.cumsum(np.concatenate([[0.0], x.astype(np.float64)]))
    out = (c[w:] - c[:-w]) / w
    pad = len(x) - len(out)
    return np.pad(out, (pad // 2, pad - pad // 2), mode="edge").astype(np.float32)


def put(buf, x, at, gain=1.0):
    a = sec(at)
    b = min(a + len(x), len(buf))
    buf[a:b] += x[: b - a] * gain


def fade(x, fi=0.01, fo=0.04):
    x = x.copy()
    i, o = sec(fi), sec(fo)
    if i: x[:i] *= np.linspace(0, 1, i)
    if o: x[-o:] *= np.linspace(1, 0, o)
    return x


put(voice, fade(v[sec(SEG1[0]):sec(SEG1[1])]), INTRO)
put(voice, fade(v[sec(SEG2[0]):sec(SEG2[1])]), SEG2[0] + OFF2)

# last line: three takes, each time-warped (DTW + WSOLA) onto the first take so every syllable lands together
sys.path.insert(0, str(Path(__file__).parent))
from align import dtw_map, wsola

def trim(x):
    env = movavg(np.abs(x), 480)
    on = np.where(env > env.max() * 0.08)[0]
    return x[max(on[0] - sec(0.03), 0): min(on[-1] + sec(0.12), len(x))]

raw = [trim(v[sec(a):sec(b)]) for a, b in TAKES]
ref_take = raw[0]
level = np.sqrt(np.mean(ref_take ** 2)) + 1e-6
aligned = [ref_take]
for x in raw[1:]:
    mp = dtw_map(ref_take, x)
    w = wsola(x, mp, len(ref_take))
    aligned.append(w * level / (np.sqrt(np.mean(w ** 2)) + 1e-6))
L_all = len(ref_take)
lead = fade(aligned[0]) * 0.60
left = fade(aligned[1]) * 0.50
right = fade(aligned[2]) * 0.50
mix_all = lead + left + right
chorusL = np.zeros(n, np.float32); chorusR = np.zeros(n, np.float32)
put(chorusL, lead + left * 1.25 + right * 0.55, ALL_AT)
put(chorusR, lead + left * 0.55 + right * 1.25, ALL_AT)
put(voice, mix_all, ALL_AT)  # mono copy, only for ducking and the talk animation

# who speaks when (film time), from the transcription's line boundaries
lines = [
    ("O1", 1, 0.00, 4.18, "حاسس بيها؟ لأ؟ طبيعي... محدش حاسس."),
    ("M1", 2, 4.18, 10.26, "الدلتا بتهبط لحد حداشر ملّي كل سنة، والبحر بيعلى. حاجة أبطأ من إن عينك تشوفها."),
    ("I1", 3, 10.26, 20.12, "بس فيه حد شايفها... من الفضاء. نيسار، قمر الرادار بتاع ناسا والهند، بيصوّر الأرض كل اتناشر يوم، بالليل والنهار، ومن ورا السحاب."),
    ("O2", 1, 20.12, 22.46, "عشان كده عملنا أندولا."),
    ("M2", 2, 22.46, 30.00, "عشر أماكن حقيقية على الكوكب. دوس على أي واحد، وشوف الأرض وهي بتتحرك... أو أي حتة تانية، لايف من ناسا."),
    ("O3", 1, 30.00, 33.95, "لأ وكمان... اسمعها. كل سنتي، نوتة."),
    ("I2", 3, 33.90, 40.70, "وسنة ألفين ومية؟ ده المكان اللي البحر ممكن يوصله. ولو شلت هبوط الأرض... أكتر من النص بيختفي."),
    ("M3", 2, 40.70, 45.95, "لف بنفسك مع أسترويونت، قارن زمان بالنهارده، وكل رقم جنبه مصدره."),
]
words = json.load(open(OUT / "words.json", encoding="utf-8"))
wl = [w for s in words for w in s["words"]]
timeline = []
for key, who, a, b, text in lines:
    off = OFF2 if key in ("I2", "M3") else INTRO
    s0, s1 = a + off, b + off
    # word timings from whisper inside this line (used to pace the karaoke caption)
    ws = [(w["s"] + off, w["e"] + off) for w in wl if w["s"] >= a - 0.05 and w["e"] <= b + 0.05]
    timeline.append({"id": key, "who": who, "start": round(s0, 3), "end": round(s1, 3), "text": text, "wt": ws})
    spk[sec(s0):sec(s1)] = who
timeline.append({"id": "ALL", "who": 4, "start": round(ALL_AT, 3), "end": round(ALL_AT + L_all / SR, 3), "text": "ودي أندولا... تعالوا نوريكم.", "wt": []})

# ---- music bed: soft pad, A minor then brighter after the logo ----
t = np.arange(n) / SR
def pad(freqs, amp):
    out = np.zeros(n, np.float32)
    for f in freqs:
        for det in (-0.6, 0.0, 0.7):
            out += np.sin(2 * np.pi * (f + det) * t + det) * amp
    return out
LOGO = 20.12 + INTRO
minor = pad([110.0, 130.81, 164.81, 220.0], 0.012)
major = pad([87.31, 130.81, 174.61, 220.0, 261.63], 0.011)   # F major colour
x = np.clip((t - LOGO + 0.3) / 1.2, 0, 1)
bed = minor * (1 - x) + major * x
lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.08 * t)
bed *= lfo * np.clip((t - 2.6) / 2.0, 0, 1) * np.clip((TOTAL - t) / 1.5, 0, 1)
# duck under the voice
env = movavg(np.abs(voice), sec(0.25))
env = env / (env.max() + 1e-6)
bed *= 1 - 0.55 * np.clip(env * 4, 0, 1)

# ---- SFX ----
sfx = np.zeros(n, np.float32)
rng = np.random.default_rng(7)
def whoosh(at, dur=1.4, amp=0.16):
    m = sec(dur); noise = rng.standard_normal(m).astype(np.float32)
    k = np.linspace(0, 1, m)
    shaped = movavg(noise, 40) * np.sin(np.pi * k) ** 2 * amp
    put(sfx, shaped, at)
def boom(at, amp=0.5):
    m = sec(1.6); k = np.arange(m) / SR
    put(sfx, (np.sin(2 * np.pi * (55 * np.exp(-k * 1.5)) * k) * np.exp(-k * 2.6) * amp).astype(np.float32), at)
    put(sfx, (np.sin(2 * np.pi * 880 * k) * np.exp(-k * 3) * 0.05 + np.sin(2 * np.pi * 1318.5 * k) * np.exp(-k * 3.5) * 0.04).astype(np.float32), at + 0.02)
whoosh(10.26 + INTRO - 0.3, 1.8, 0.14)      # satellite passes
boom(LOGO)                                  # logo
whoosh(ALL_AT - 0.6, 1.2, 0.12)
boom(ALL_AT + 0.1, 0.35)

# heartbeat intro, ground notes solo
hb = load(SND / "ground-heartbeat.wav")[: sec(INTRO + 0.6)]
hb = fade(hb, 0.05, 0.6) * 0.9
put(sfx, hb, 0.0)
notes = load(SND / "ground-sinking-notes.wav")
nstart = INTRO + (SEG1[1] - SEG1[0]) - 0.15
seg = notes[sec(0.3): sec(0.3 + NOTES + 0.5)]
put(sfx, fade(seg, 0.02, 0.4) * 0.85, nstart)
# quiet notes under O3's "listen" line too
put(sfx, fade(notes[sec(2.0):sec(4.0)], 0.3, 0.6) * 0.22, nstart - 2.0)

a0 = sec(ALL_AT); a1 = a0 + L_all
base = voice.copy(); base[a0:a1] -= mix_all[: a1 - a0]
mixL = base + chorusL + bed + sfx
mixR = base + chorusR + bed + sfx
peak = max(np.max(np.abs(mixL)), np.max(np.abs(mixR))) + 1e-6
st = np.stack([mixL, mixR], 1) / peak * 0.89
pcm = (np.clip(st, -1, 1) * 32767).astype("<i2")
subprocess.run([FF, "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "loudnorm=I=-15:TP=-1.5:LRA=11", "-ar", str(SR), str(OUT / "mix.wav")], input=pcm.tobytes(), check=True)
# solo files of the last line, for checking the alignment
for k, x in enumerate(aligned):
    subprocess.run([FF, "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", str(OUT / f"take{k}.wav")], input=np.asarray(x, np.float32).tobytes(), check=True)

# per-frame loudness of the voice (30 fps) for the talk animation
fps = 30
hop = SR // fps
rmsf = [float(np.sqrt(np.mean(voice[i:i + hop] ** 2))) for i in range(0, n, hop)]
m = max(rmsf) or 1
spkf = [int(np.bincount(spk[i:i + hop].astype(np.int64), minlength=5).argmax()) for i in range(0, n, hop)]
json.dump({"total": round(TOTAL, 3), "intro": INTRO, "logo": round(LOGO, 3), "notes": [round(nstart, 3), round(nstart + NOTES, 3)],
           "all": round(ALL_AT, 3), "lines": timeline, "rms": [round(r / m, 3) for r in rmsf], "spk": spkf},
          open(OUT / "timeline.json", "w", encoding="utf-8"), ensure_ascii=False)
print("total", round(TOTAL, 2), "logo", round(LOGO, 2), "all", round(ALL_AT, 2), "notes", round(nstart, 2))
for l in timeline:
    print(l["id"], l["start"], l["end"], len(l["wt"]))
