// Bambara écrit -> lecture en syllabes « à la française ».
// Exemple : « Ɲelenin fana bɛ subaga kɛlɛ » -> « Gné-lé-nin fa-na bè sou-ba-ga kè-lè »
(function (global) {
  "use strict";
  const VOWELS = { a: "a", e: "é", "ɛ": "è", i: "i", o: "ô", "ɔ": "o", u: "ou" };
  // voyelle suivie d'un n qui ferme la syllabe (voyelle nasale)
  const NASAL = { a: "an", e: "én", "ɛ": "èn", i: "in", o: "on", "ɔ": "on", u: "oun" };
  const CONS = { c: "tch", j: "dj", "ɲ": "gn", "ŋ": "ng", "ʃ": "ch", q: "k" };
  const isVowel = (ch) => ch in VOWELS;
  const isLetter = (ch) => /[a-zɛɔɲŋʃ]/.test(ch);

  function consonant(ch, nextVowel) {
    if (ch === "g" && /[eɛi]/.test(nextVowel || "")) return "gu";
    return CONS[ch] || ch;
  }

  function word(raw) {
    // ancienne orthographe « ny » = ɲ
    const w = raw.toLowerCase().replace(/ny(?=[aeɛioɔu])/g, "ɲ");
    // découpe en syllabes : attaque (consonnes) + voyelle(s) + n/w final éventuel
    const syl = [];
    let i = 0;
    while (i < w.length) {
      let onset = "";
      while (i < w.length && !isVowel(w[i])) onset += w[i++];
      if (i >= w.length) { // consonnes finales sans voyelle (rare)
        if (syl.length) syl[syl.length - 1].coda += onset; else syl.push({ onset, v: "", coda: "" });
        break;
      }
      let v = w[i++];
      while (i < w.length && w[i] === v[0]) v += w[i++]; // voyelle longue
      let coda = "";
      // n ou w qui ferme la syllabe : suivi d'une consonne ou fin de mot
      if (i < w.length && (w[i] === "n" || w[i] === "w") && (i + 1 >= w.length || !isVowel(w[i + 1]))) {
        // « nn » avant voyelle : le premier n ferme la syllabe
        coda = w[i++];
      } else if (i < w.length && w[i] === "n" && w[i + 1] === "n") {
        coda = w[i++];
      }
      // une attaque de plusieurs consonnes : n + consonne en début de mot -> syllabe « n »
      if (onset.length > 1 && onset[0] === "n" && !syl.length && !/[lr]$/.test(onset)) {
        syl.push({ onset: "n", v: "", coda: "" });
        onset = onset.slice(1);
      } else if (onset.length > 1 && syl.length && !/^[bcdfgkpt][lr]$/.test(onset)) {
        // la consonne en trop rejoint la syllabe précédente
        syl[syl.length - 1].coda += onset.slice(0, -1);
        onset = onset.slice(-1);
      }
      syl.push({ onset, v, coda });
    }
    const out = syl.map(({ onset, v, coda }) => {
      let s = "";
      for (let k = 0; k < onset.length; k++) s += consonant(onset[k], k === onset.length - 1 ? v[0] : "");
      if (!v) return s + coda;
      const vowel = VOWELS[v[0]];
      if (coda[0] === "n") s += (v.length > 1 ? vowel : "") + NASAL[v[0]] + (coda.slice(1) === "w" ? "ou" : "");
      else {
        s += vowel.repeat(v.length);
        if (coda === "w") s += "ou";
        else s += [...coda].map((c) => consonant(c, "")).join("");
      }
      return s;
    }).join("-");
    return raw[0] !== raw[0].toLowerCase() ? out[0].toUpperCase() + out.slice(1) : out;
  }

  function syllabes(text) {
    return String(text || "").normalize("NFC").replace(/[A-Za-zƐƆƝŊɛɔɲŋʃ]+/g, (m) =>
      [...m.toLowerCase()].every(isLetter) ? word(m) : m);
  }

  global.syllabesBambara = syllabes;
  if (typeof module !== "undefined") module.exports = syllabes;
})(typeof window !== "undefined" ? window : globalThis);
