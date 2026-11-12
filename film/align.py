"""Time-align a voice take to a reference take: DTW on log-band spectra, then WSOLA time-warping."""
import numpy as np

SR = 48000
HOP, WIN = 480, 1200


def bands(x):
    n = 1 + max(0, (len(x) - WIN) // HOP)
    win = np.hanning(WIN)
    frames = np.stack([x[i * HOP:i * HOP + WIN] * win for i in range(n)])
    spec = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    freqs = np.fft.rfftfreq(WIN, 1 / SR)
    edges = np.geomspace(90, 7000, 33)
    f = np.stack([spec[:, (freqs >= lo) & (freqs < hi)].sum(1) for lo, hi in zip(edges[:-1], edges[1:])], 1)
    f = np.log(f + 1e-8)
    f -= f.mean(1, keepdims=True)
    f /= np.linalg.norm(f, axis=1, keepdims=True) + 1e-8
    return f


def dtw_map(ref, take):
    """For each reference frame, the matching frame index in `take` (monotonic, smoothed)."""
    A, B = bands(ref), bands(take)
    n, m = len(A), len(B)
    cost = 1 - A @ B.T
    D = np.full((n + 1, m + 1), np.inf); D[0, 0] = 0
    for i in range(1, n + 1):
        ci = cost[i - 1]
        for j in range(1, m + 1):
            D[i, j] = ci[j - 1] + min(D[i - 1, j - 1], D[i - 1, j] + 0.15, D[i, j - 1] + 0.15)
    i, j, path = n, m, []
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        k = np.argmin([D[i - 1, j - 1], D[i - 1, j] + 0.15, D[i, j - 1] + 0.15])
        if k == 0: i, j = i - 1, j - 1
        elif k == 1: i -= 1
        else: j -= 1
    path.reverse()
    mp = np.zeros(n)
    cnt = np.zeros(n)
    for a, b in path:
        mp[a] += b; cnt[a] += 1
    mp /= np.maximum(cnt, 1)
    k = 7
    mp = np.convolve(np.pad(mp, (k // 2, k // 2), mode="edge"), np.ones(k) / k, "valid")
    return np.maximum.accumulate(mp)


def wsola(take, frame_map, out_len, N=1920, tol=240):
    """Warp `take` so that output time t plays take time map(t)."""
    Ho = N // 2
    win = np.hanning(N + 1)[:N]
    out = np.zeros(out_len + N, np.float32); norm = np.zeros(out_len + N, np.float32)
    x = np.pad(take, (N + tol, N + tol)).astype(np.float32)
    off = N + tol
    prev = None
    for k in range(0, out_len, Ho):
        center_frame = (k + N / 2) / HOP
        src = np.interp(center_frame, np.arange(len(frame_map)), frame_map) * HOP + WIN / 2 - N / 2
        p = int(round(src)) + off
        if prev is not None:
            nat = x[prev + Ho: prev + Ho + N]
            best, bv = 0, -np.inf
            for d in range(-tol, tol + 1, 8):
                seg = x[p + d: p + d + N]
                v = float(np.dot(seg, nat))
                if v > bv: bv, best = v, d
            p += best
        g = x[p:p + N] * win
        out[k:k + N] += g; norm[k:k + N] += win
        prev = p
    out = out[:out_len] / np.maximum(norm[:out_len], 1e-3)
    return out
