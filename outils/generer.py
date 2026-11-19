"""Génère phrases.json (traduction + numéro audio) et la voix IA (voix/NNN.mp3).

Usage : python generer.py chemin/phrases.sql dossier_site [--sans-voix]
Voix IA : modèle Meta MMS-TTS bambara (facebook/mms-tts-bam, licence CC-BY-NC 4.0).
"""
import json, re, subprocess, sys, pathlib, tempfile

sql, site = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
rows = re.findall(r"\('((?:[^']|'')*)',\s*'((?:[^']|'')*)'\)", sql.read_text(encoding="utf-8"))
phrases = [(a.replace("''", "'").strip(), b.replace("''", "'").strip()) for a, b in rows]
phrases.insert(0, ("I ni sɔgɔma.", "Bonjour (le matin)."))  # phrase du mode essai

data = {bm: {"fr": fr, "a": f"{n:03d}"} for n, (bm, fr) in enumerate(phrases)}
(site / "phrases.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(len(data), "phrases dans phrases.json")
if "--sans-voix" in sys.argv:
    sys.exit()

import torch, soundfile
from transformers import VitsModel, AutoTokenizer

tok = AutoTokenizer.from_pretrained("facebook/mms-tts-bam")
model = VitsModel.from_pretrained("facebook/mms-tts-bam").eval()
out = site / "voix"
out.mkdir(exist_ok=True)
tmp = pathlib.Path(tempfile.mkdtemp())
for bm, info in data.items():
    target = out / (info["a"] + ".mp3")
    if target.exists():
        continue
    inputs = tok(bm.lower(), return_tensors="pt")
    if inputs["input_ids"].shape[1] == 0:
        print("ignorée :", bm); continue
    torch.manual_seed(0)
    with torch.no_grad():
        wave = model(**inputs).waveform[0].numpy()
    wav = tmp / "x.wav"
    soundfile.write(wav, wave, model.config.sampling_rate)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-ac", "1", "-b:a", "40k", str(target)], check=True)
    print(info["a"], bm[:50])
