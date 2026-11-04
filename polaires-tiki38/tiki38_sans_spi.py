# Polaires Tiki 38 sans spi : même méthode que les polaires actuelles (règle Wharram 50 % / 80 %,
# plafond 16 nds, MAMAW imprimé), mais toujours avec le gréement de route 54,62 m² (jamais la chute 96,1 m²).
import math, json, sys
A_SAIL, A_LIGHT, A_HULL, A_REF = 54.62, 96.1, 12.35, 66.97
MAMAW = {"c": 25.3, "l": 21.0}
V_MAX = 16.0
R = math.sqrt(A_SAIL / A_LIGHT)   # onglet Méthode : rapport de surface portant / route

def coef(twa, chute, nospi=False):
    if twa < 35: return 0.0
    if twa < 50: return 0.50 * ((twa - 35) / 15) ** 1.3
    if twa <= 110:
        k = 0.50 + 0.35 * math.sin((twa - 50) / 60 * math.pi / 2)
    elif twa <= 150:
        k = 0.85 - 0.05 * (twa - 110) / 40
    else:
        x = (twa - 150) / 30
        return 0.80 - 0.08 * x if chute else 0.80 * R * (1 - 0.12 * x)
    if nospi and twa > 100:      # le spi commence à 100° ; sans lui, on rejoint la règle « 80 % × racine » à 150°
        k *= 1 - (1 - R) * (twa - 100) / 50
    return k

def aws(twa, tws, b):
    r = math.radians(twa); return math.hypot(tws * math.cos(r) + b, tws * math.sin(r))

def curve(twa, tws, chute, nospi):
    return V_MAX * math.tanh(coef(twa, chute, nospi) * tws / V_MAX)

def solve(twa, tws, case, nospi):
    if tws <= 0 or twa < 35: return 0.0
    use = (twa >= 100) and not nospi
    ref = A_LIGHT if use else A_SAIL; sail = ref; b = 0.0
    for _ in range(12):
        b = curve(twa, tws, use, nospi) * (math.sqrt(sail / ref) if sail < ref - 0.2 else 1.0)
        w = aws(twa, tws, b); lim = MAMAW[case] * math.sqrt(A_REF / (sail + A_HULL))
        if w <= lim + 0.15: break
        new = max(8.0, A_REF * (MAMAW[case] / max(w, 0.5)) ** 2 - A_HULL)
        if use and new < A_LIGHT - 1: use = False; ref = A_SAIL; new = min(new, A_SAIL)
        sail = min(sail, new)
    return round(b, 2)

TWA = list(range(0, 181, 5))
GRID = {"c": [0, 4, 6, 8, 10, 12, 14, 16, 20, 25, 30, 35, 40], "l": [0, 4, 6, 8, 10, 12, 14, 16, 20, 25, 30]}
def table(case, nospi):
    return [[solve(a, w, case, nospi) for w in GRID[case]] for a in TWA]
if __name__ == "__main__":
    json.dump({k: {"tws": GRID[k], "twa": TWA, "avec": table(k, False), "sans": table(k, True)} for k in "cl"}, open(sys.argv[1], "w"))

# Polaire légère de l'appli : tiki38_leger.pol (15 angles), interpolée tous les 5°, 0 sous 40°.
import numpy as np
TWA_L = [0, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 135, 150, 165, 180]
TWS_L = [4, 6, 8, 10, 12, 14, 16, 20, 25, 30]
def leger(nospi):
    base = np.array([[solve(a, w, "l", nospi) for w in TWS_L] for a in TWA_L])
    return [[0.0] + [0.0 if a < 40 else round(float(np.interp(a, TWA_L, base[:, j])), 2) for j in range(len(TWS_L))] for a in TWA]
def write_pol(path, tws, rows, sep="\t"):
    lines = [sep.join(["TWA\\TWS"] + [str(w) for w in tws])] + [sep.join([str(a)] + [f"{v:.2f}" for v in r]) for a, r in zip(TWA, rows)]
    open(path, "wb").write(("\r\n".join(lines) + "\r\n").encode("ascii"))
