# Hors-Série RAG — Scripts

Série complète de 6 épisodes courts (~50s) sur la construction d'un RAG.

---

## HS·01 — Comment j'ai construit mon deuxième cerveau avec le RAG

> Session 2026-10-11

---

## HS·02 — Chunker sans tout casser

> Session 2026-10-11

---

## HS·03 — Ce que signifie un vecteur

> 2026-10-12 · 47s · 1410 frames

- Tu poses une question. Le LLM la transforme en 1536 nombres.
- Pas des mots. Des coordonnées.
- Chaque mot, chaque phrase a une position dans cet espace.
- Les mots proches dans le sens sont proches dans l'espace.
- "chat" et "félin" — distance quasi nulle.
- "chat" et "facture" — très loin l'un de l'autre.
- C'est ce qu'on appelle un embedding.
- Un vecteur, c'est une adresse. Dans un espace à 1536 dimensions.
- Ton RAG ne lit pas tes notes. Il navigue dans cet espace.
- Il cherche les adresses les plus proches de ta question.
- Même sens, mots différents — même voisinage. C'est ça, la puissance.
- Tes notes sont indexées comme des coordonnées.

---

## HS·04 — Comment le RAG choisit

> 2026-10-12 · 49s · 1470 frames

- Tu poses une question. Le RAG la transforme en vecteur.
- Puis il cherche les 5 chunks les plus proches.
- Pas les plus récents. Pas les plus longs. Les plus proches dans l'espace du sens.
- Ces 5 chunks sont injectés dans le prompt.
- Le LLM ne voit que ça. Rien d'autre.
- Il génère une réponse à partir de ce contexte uniquement.
- Si les chunks sont bons — la réponse est bonne.
- Si les chunks sont mauvais — même le meilleur LLM répond à côté.
- Le problème n'est jamais le modèle.
- C'est ce qu'on a mis dans sa fenêtre.
- Le LLM n'invente pas. Il synthétise ce que le RAG lui a mis sous les yeux.
- Le RAG ne cherche pas la vérité. Il cherche les bons voisins.

---

## HS·05 — Quand le RAG se trompe

> 2026-10-12 · 52s · 1560 frames

- Tu as un bon LLM. Un bon chunking. Et le RAG répond encore à côté.
- Trois raisons. Toujours les mêmes.
- Première : la question est ambiguë. Le vecteur pointe au mauvais endroit.
- Le sens voulu n'est pas le sens encodé.
- Deuxième : le bon chunk est retrouvé. Mais il est trop court. Le contexte manque.
- Le LLM voit un fragment. Il répond sur un fragment.
- Troisième : le LLM extrapole. Il comble ce que le contexte ne dit pas.
- C'est de l'hallucination partielle. Le plus difficile à détecter.
- Dans les trois cas — ce n'est pas le modèle.
- C'est le pipeline.
- Reranker les chunks récupérés. Élargir la fenêtre de contexte. Reformuler la requête.
- Chaque erreur a son antidote.
- Un RAG qui se trompe, ça se diagnostique. Ça se corrige.

---

## HS·06 — Évaluer son RAG

> 2026-10-12 · 54s · 1620 frames

- Tu as construit ton RAG. Comment tu sais s'il fonctionne ?
- Relire les réponses une par une — c'est pas de l'évaluation.
- Deux métriques. Une seule question.
- Le contexte récupéré était-il pertinent ?
- Et la réponse est-elle fidèle à ce contexte — rien d'autre ?
- Pertinence du retrieval. Fidélité de la génération.
- Si le retrieval rate — peu importe le LLM. La réponse sera mauvaise.
- Si le retrieval est bon mais la réponse dévie — le prompt manque de contraintes.
- Un LLM peut noter un autre LLM. C'est le LLM-as-a-judge.
- Fidélité, pertinence — à grande échelle. Automatiquement.
- Ce n'est pas parfait. Mais c'est systématique.
- Un RAG non évalué, c'est un système non maîtrisé.
- Six épisodes. Chunking. Vecteurs. Retrieval. Pannes. Évaluation. Un système complet.
- Ton deuxième cerveau est prêt.
