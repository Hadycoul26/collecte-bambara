"""Fabrique les répliques de Toto le robot pour chaque phrase (lancé par GitHub Actions).

Pour chaque phrase NNN de phrases.json :
  toto/NNN_0.mp3  version très ratée
  toto/NNN_1.mp3  version presque juste (une erreur)
  toto/NNN_2.mp3  version juste
et toto.json : {"NNN": [texte_raté, texte_presque, texte_juste]}

Voix : synthèse du projet (bambara_voice.tts, facebook/mms-tts-bam),
passée dans un filtre « robot » (voix plus aiguë et métallique).
"""
import json, pathlib, random, re, subprocess, sys, tempfile

site = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
phrases = json.loads((site / "phrases.json").read_text(encoding="utf-8"))

SWAPS = {"ɛ": "e", "ɔ": "o", "ɲ": "n", "e": "ɛ", "o": "ɔ", "u": "i", "i": "u", "a": "o"}
BETISES = ["bip", "malo", "saga", "bonbon", "wari", "kɔnɔ", "bɛrɛ", "nɔnɔ", "ji", "baga"]
SYLLABE = re.compile(r"^[^aeɛioɔu]*[aeɛioɔu]+n?", re.I)


def words(text):
    return re.findall(r"[^\s]+", text)


def bege(word):  # bégaiement : « ka-ka-kalan »
    m = SYLLABE.match(word)
    return f"{m.group(0)}-{m.group(0)}-{word}" if m and len(word) > 2 else word


def voyelle(word, rnd):
    spots = [i for i, ch in enumerate(word) if ch.lower() in SWAPS]
    if not spots:
        return word
    i = rnd.choice(spots)
    return word[:i] + SWAPS[word[i].lower()] + word[i + 1:]


def erreur(ws, rnd):
    ws = list(ws)
    if not ws:
        return ws
    op = rnd.choice(["voyelle", "voyelle", "bege", "betise", "oubli", "echange"])
    i = rnd.randrange(len(ws))
    if op == "voyelle":
        ws[i] = voyelle(ws[i], rnd)
    elif op == "bege":
        ws[i] = bege(ws[i])
    elif op == "betise":
        ws[i] = rnd.choice(BETISES)
    elif op == "oubli" and len(ws) > 2:
        del ws[i]
    elif op == "echange" and len(ws) > 2:
        j = min(i + 1, len(ws) - 1)
        ws[i], ws[j] = ws[j], ws[i]
    else:
        ws[i] = voyelle(ws[i], rnd)
    return ws


def variantes(text, numero):
    rnd = random.Random(numero)
    presque = erreur(words(text), rnd)
    rate = words(text)
    for _ in range(max(3, len(rate) // 2)):
        rate = erreur(rate, rnd)
    presque, rate = " ".join(presque), " ".join(rate)
    if presque == text:
        presque = " ".join([bege(w) if k == 0 else w for k, w in enumerate(words(text))])
    return [rate, presque, text]


if __name__ == "__main__":
    textes = {info["a"]: variantes(bm, int(info["a"])) for bm, info in phrases.items()}
    (site / "toto.json").write_text(json.dumps(textes, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(textes), "phrases dans toto.json")
    if "--sans-voix" in sys.argv:
        sys.exit()

    import torch
    from bambara_voice.config import TTSConfig
    from bambara_voice.tts import SpeechSynthesizer

    tts = SpeechSynthesizer(TTSConfig())
    out = site / "toto"
    out.mkdir(exist_ok=True)
    wav = pathlib.Path(tempfile.mkdtemp()) / "x.wav"
    robot = "asetrate=16000*1.22,aresample=22050,atempo=0.9,aecho=0.8:0.7:7:0.45,highpass=f=180,volume=1.6"
    made = 0
    for numero, lignes in textes.items():
        for k, texte in enumerate(lignes):
            target = out / f"{numero}_{k}.mp3"
            if target.exists():
                continue
            torch.manual_seed(int(numero) * 3 + k)
            result = tts(texte)
            if not len(result.audio):
                continue
            result.save(wav)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-af", robot,
                            "-ac", "1", "-b:a", "40k", str(target)], check=True)
            made += 1
            if made % 100 == 0:
                print(made, "répliques", flush=True)
    # Répliques fixes de Toto (le jeu les joue quand il demande de répéter, etc.)
    DIT = {"repete": "Segin a kan !", "compris": "N ma a faamu.", "encore": "A kalan tugun !"}
    for cle, texte in DIT.items():
        target = out / f"dit_{cle}.mp3"
        if target.exists():
            continue
        torch.manual_seed(7)
        result = tts(texte)
        if not len(result.audio):
            continue
        result.save(wav)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-af", robot,
                        "-ac", "1", "-b:a", "40k", str(target)], check=True)
        made += 1
    print("Terminé :", made, "nouvelles répliques")
