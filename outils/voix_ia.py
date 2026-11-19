"""Génère la voix IA de chaque phrase (voix/NNN.mp3) à partir de phrases.json.

Utilise la synthèse vocale du projet IA Bambara (bambara_voice.tts, modèle
facebook/mms-tts-bam). Lancé par GitHub Actions (.github/workflows/voix-ia.yml).
"""
import json, pathlib, subprocess, sys, tempfile

site = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
data = json.loads((site / "phrases.json").read_text(encoding="utf-8"))

from bambara_voice.config import TTSConfig
from bambara_voice.tts import SpeechSynthesizer
import torch

config = TTSConfig()
print("Modèle de voix du projet :", config.model_id, flush=True)
tts = SpeechSynthesizer(config)

out = site / "voix"
out.mkdir(exist_ok=True)
tmp = pathlib.Path(tempfile.mkdtemp()) / "x.wav"
made = 0
for bm, info in data.items():
    target = out / (info["a"] + ".mp3")
    if target.exists():
        continue
    torch.manual_seed(0)  # même voix à chaque génération
    result = tts(bm)
    if not len(result.audio):
        print("ignorée :", bm)
        continue
    result.save(tmp)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(tmp), "-ac", "1", "-b:a", "48k", str(target)], check=True)
    made += 1
    if made % 25 == 0:
        print(made, "voix générées", flush=True)
print("Terminé :", made, "nouvelles voix,", len(list(out.glob("*.mp3"))), "au total")
