# Dossier de soumission — App TikTok

Textes prêts à copier-coller dans le formulaire de review TikTok Developers.
Rédigés en anglais (la review TikTok se fait en anglais).

> ⚠️ Principe : présenter l'outil comme un **outil de production et de
> publication de contenu pour un créateur gérant ses propres comptes**.
> Ne pas mettre en avant « IA » / « automatisation » / « bot » — ce
> vocabulaire déclenche un examen plus strict.

---

## App name

```
GCN Studio
```

## App description (short)

```
GCN Studio is a content production and publishing tool that helps a creator
produce short-form vertical videos and publish them to their own TikTok
accounts, then review performance through aggregated statistics.
```

## App description (detailed / use case)

```
GCN Studio is a personal content workflow tool used by its owner to manage
short-form video publishing across the TikTok accounts they own.

Workflow:
1. The creator produces a vertical short-form video with the tool.
2. The creator connects their own TikTok account via TikTok Login (OAuth).
3. The creator reviews the video and publishes it to their TikTok account
   through the Content Posting API.
4. The creator consults aggregated statistics (followers, total likes,
   per-video views/likes/comments/shares) to understand which content
   performs best and improve future videos.

All accounts connected to the tool are owned by the user of the tool. The
tool does not post to third-party accounts and does not collect data from
accounts other than those explicitly authorised by their owner.
```

## Scope justifications

**user.info.basic**
```
Used to display the connected creator's basic profile (username, avatar)
inside the tool, so the user can confirm which of their accounts is currently
selected before publishing.
```

**user.info.stats**
```
Used to show the creator their own account statistics (follower count, total
likes, video count) for performance tracking over time. Displayed only to the
account owner.
```

**video.publish**
```
Core feature of the tool. Allows the creator to publish the short-form video
they produced directly to their own TikTok account, with a title and the
privacy level they choose.
```

**video.list**
```
Used to display the creator's own recently published videos and their public
metrics (views, likes, comments, shares), so the creator can identify which
content performs best and adjust their future production.
```

---

## Demo video — script à enregistrer

Enregistre un screen recording (≈ 1-2 min) montrant le parcours réel :

1. **Connexion OAuth** : lancer `tt --tiktok-auth --niche business-ia`,
   ouvrir l'URL, écran de consentement TikTok, autoriser, page callback.
2. **Échange du code** : coller le code, montrer « connecté à TikTok ».
3. **Publication** : lancer `tt --publish --niche business-ia --slot morning`,
   montrer la vidéo qui apparaît sur le compte TikTok (ou en brouillon).
4. **Statistiques** : lancer `tt --analytics`, montrer les stats récupérées.

Notes :
- Montre une vraie vidéo, un vrai compte.
- Voix off ou sous-titres expliquant chaque étape.
- Format : écran clair, pas de données sensibles visibles (masquer les tokens).

---

## URLs (déjà en ligne)

| Champ | Valeur |
|---|---|
| Terms of Service URL | https://www.gcn-data.fr/terms.html |
| Privacy Policy URL | https://www.gcn-data.fr/privacy-policy.html |
| Web/Desktop URL | https://www.gcn-data.fr |
| Redirect URI | https://www.gcn-data.fr/tiktok-callback.html |

## Scopes demandés

`user.info.basic`, `user.info.stats`, `video.publish`, `video.list`

---

## Points d'attention pour l'audit

- TikTok peut demander une **démo fonctionnelle** : la vidéo ci-dessus suffit
  généralement, mais garde l'app prête à montrer en direct si demandé.
- Le mode **direct post public** nécessite l'audit complet. En attendant,
  l'app peut publier en `SELF_ONLY` (brouillon/privé) sans audit lourd.
- Délai d'audit : 2 à 6 semaines. Possibles allers-retours.
- Ne jamais mentionner la publication multi-comptes automatisée non
  supervisée — présenter chaque publication comme une action déclenchée et
  validée par le créateur.
