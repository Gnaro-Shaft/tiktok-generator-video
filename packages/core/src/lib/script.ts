import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { env, loadPrompt, NICHES_DIR } from './config.js';
import type { GeneratedScript, NicheConfig } from '../types/index.js';

interface GenerateOptions {
  niche: NicheConfig;
  topicHint?: string;
  forceLonger?: boolean;
  forceShorter?: boolean;
}

const HISTORY_FILE = (nicheId: string) =>
  path.join(NICHES_DIR, nicheId, 'state', 'topic-history.jsonl');

function loadRecentTopics(nicheId: string, limit = 30): string[] {
  const file = HISTORY_FILE(nicheId);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
  return lines
    .slice(-limit)
    .map((l) => {
      try {
        return JSON.parse(l).topic as string;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

export function saveTopicToHistory(nicheId: string, topic: string): void {
  const file = HISTORY_FILE(nicheId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(
    file,
    JSON.stringify({ ts: new Date().toISOString(), topic }) + '\n'
  );
}

export async function generateScript(opts: GenerateOptions): Promise<GeneratedScript> {
  const { niche, topicHint, forceLonger, forceShorter } = opts;
  const client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });

  const systemPrompt = loadPrompt(niche.id, 'system');
  const recent = loadRecentTopics(niche.id);
  const avoid =
    recent.length > 0
      ? `\n\nÉvite absolument ces sujets déjà traités récemment : ${recent.join(', ')}.`
      : '';

  const userPrompt = niche.mode === 'slides'
    ? buildSlidesPrompt(niche, topicHint, avoid, forceLonger)
    : buildNarrationPrompt(niche, topicHint, avoid, forceLonger, forceShorter);

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('');

  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error(`No JSON in script response: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));

  if (niche.mode === 'slides') {
    return {
      mode: 'slides',
      topic: parsed.topic ?? 'sujet inconnu',
      hook: parsed.hook,
      scenes: parsed.scenes ?? [],
      cta: parsed.cta,
      caption: parsed.caption ?? '',
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  }

  // Narration mode: validate the structure Claude returned to avoid
  // `Cannot read properties of undefined` at downstream steps.
  if (!parsed.script || typeof parsed.script !== 'object') {
    throw new Error(`Script JSON sans champ "script": ${text.slice(0, 200)}`);
  }
  const hook = parsed.script.hook ?? '';
  const body = parsed.script.body ?? '';
  const cta = parsed.script.cta ?? '';
  if (!hook || !body) {
    throw new Error(`Script incomplet (hook="${hook.slice(0, 30)}…", body=${body.length} chars)`);
  }

  const full_text = `${hook}. ${body} ${cta}`.trim();
  return {
    mode: 'narration',
    topic: parsed.topic ?? 'sujet inconnu',
    script: { hook, body, cta },
    full_text,
    caption: parsed.caption ?? '',
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
  };
}

const KEYWORDS_SAFE_RULE = `Les keywords servent à trouver du stock vidéo TikTok-safe (compte qui peut être vu par tous). PROSCRIS tout ce qui peut renvoyer du contenu suggestif, sexualisé, body-shaming ou ambigü : pas de "lingerie/underwear/bra/bikini/swimsuit", pas de "bedroom/shower/bath/massage/spa", pas de "sexy/seductive", pas de "cleavage/thigh", pas de "kissing/intimate/dance club/pole dance/twerk". Préfère des plans abstraits, professionnels, neutres : workspace, laptop, calendar, city skyline, ai dashboard, growth chart, etc.`;

function buildNarrationPrompt(
  niche: NicheConfig,
  topicHint: string | undefined,
  avoid: string,
  forceLonger: boolean | undefined,
  forceShorter: boolean | undefined
): string {
  // ElevenLabs FR avec pauses naturelles ≈ 2.3 mots/s effectifs (post compression silence).
  const wordsTarget = Math.round(niche.duration.target_sec * 2.3);
  const wordsMin = Math.round(niche.duration.min_sec * 2.3);
  const wordsMax = Math.round(niche.duration.max_sec * 2.3);
  return [
    `Niche: ${niche.topic}`,
    `Description: ${niche.description}`,
    `Langue: ${niche.language}`,
    `Durée audio cible: ${niche.duration.target_sec}s (min ${niche.duration.min_sec}s, max ${niche.duration.max_sec}s)`,
    `Calibrage du nombre de mots TOTAL (hook + body + cta) — la voix FR lit ~2.6 mots/seconde :`,
    `  • cible : ${wordsTarget} mots`,
    `  • minimum : ${wordsMin} mots (sinon vidéo trop courte, perd la monétisation TikTok)`,
    `  • maximum : ${wordsMax} mots (au-delà, ça déborde et casse le rythme)`,
    `Compte tes mots avant de rendre la réponse. Ajuste si nécessaire.`,
    topicHint ? `Sujet imposé: ${topicHint}` : 'Choisis un sujet pertinent, original, actionnable.',
    forceLonger ? `🚨 ALERTE — La précédente version faisait moins de ${niche.duration.min_sec}s en synthèse vocale (perte de monétisation TikTok). C'est CRITIQUE. Tu DOIS générer un script d'au moins ${wordsMin + 15} mots — vise même ${wordsTarget + 10} mots pour avoir une marge. Ajoute 2 exemples chiffrés concrets, une étape détaillée supplémentaire, ou une anecdote courte. Compte tes mots avant de répondre. Si tu rends moins de ${wordsMin + 15} mots, tu auras échoué.` : '',
    forceShorter ? `🚨 ALERTE — La précédente version dépassait ${niche.duration.max_sec}s. Tu DOIS rester strictement sous ${wordsMax - 10} mots cette fois. Supprime un exemple ou une étape entière. Compte tes mots. Reste cependant au-dessus de ${wordsMin + 10} mots.` : '',
    '',
    `⚠️ RYTHME DE FIN — Les 2 dernières phrases du body doivent ÉCOULER, pas STACCATO :`,
    `  ❌ MAUVAIS : "Pas les intentions. Pas les coulisses. Pas les excuses." (3 phrases courtes = 3 longues pauses ElevenLabs)`,
    `  ✅ BON : "Pas les intentions, pas les coulisses, pas les excuses." (1 phrase avec virgules = 1 pause finale)`,
    `Évite d'enchaîner 2-3 phrases courtes (< 6 mots) successives dans les 15 derniers mots du body OU dans le CTA. Préfère 1 phrase plus longue avec virgules.`,
    avoid,
    '',
    KEYWORDS_SAFE_RULE,
    '',
    'Réponds UNIQUEMENT avec un objet JSON valide, aucun markdown, aucun commentaire, structure exacte:',
    '{',
    '  "topic": "string court décrivant le sujet",',
    '  "script": {',
    '    "hook": "phrase d\'accroche 3-8 mots, percutante",',
    '    "body": "corps du script narré, ton direct",',
    '    "cta": "call-to-action 5-12 mots"',
    '  },',
    '  "caption": "description courte pour TikTok, max 150 caractères, accrocheuse",',
    '  "hashtags": ["5 hashtags pertinents sans #"],',
    '  "keywords": ["6-10 mots-clés visuels en anglais TikTok-safe pour stock footage (voir règles ci-dessus)"]',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSlidesPrompt(
  niche: NicheConfig,
  topicHint: string | undefined,
  avoid: string,
  forceLonger: boolean | undefined
): string {
  const target = niche.duration.target_sec;
  return [
    `Niche: ${niche.topic}`,
    `Description: ${niche.description}`,
    `Langue: ${niche.language}`,
    `Format: SLIDES (vidéo SANS voix, texte affiché à l'écran sur clips de fond).`,
    `Durée cible totale: ${target}s (min ${niche.duration.min_sec}s, max ${niche.duration.max_sec}s).`,
    `Le viewer LIT le texte. Phrases courtes, percutantes, lisibles en moins de 4 secondes par scène.`,
    topicHint ? `Sujet imposé: ${topicHint}` : 'Choisis un sujet pertinent, original, actionnable.',
    forceLonger ? 'IMPORTANT: ajoute des scènes pour atteindre la durée cible.' : '',
    avoid,
    '',
    KEYWORDS_SAFE_RULE,
    '',
    `Construis 7-10 scènes qui s'enchaînent. Chaque scène = UNE phrase courte (max 14 mots) qui tient à l'écran 5-9 secondes.`,
    `La somme des durées DOIT être entre ${niche.duration.min_sec} et ${niche.duration.max_sec} secondes.`,
    `La 1ère scène est le HOOK. La dernière scène est le CTA. Les scènes du milieu développent le message.`,
    '',
    `Tu peux mettre en valeur UN mot par scène via le champ "emphasis" (chiffre clé, mot puissant). Optionnel.`,
    '',
    'Réponds UNIQUEMENT avec un objet JSON valide, aucun markdown, structure exacte:',
    '{',
    '  "topic": "string court décrivant le sujet",',
    '  "hook": "1ère scène — phrase d\'accroche 4-10 mots",',
    '  "scenes": [',
    '    {"text": "phrase 1 (= hook)", "duration_sec": 4.5, "emphasis": "mot clé optionnel"},',
    '    {"text": "phrase 2", "duration_sec": 6.0},',
    '    {"text": "phrase 3", "duration_sec": 7.0, "emphasis": "847"},',
    '    "... 7 à 10 scènes au total ..."',
    '  ],',
    '  "cta": "phrase de la dernière scène (mêmes contenu que scenes[last].text)",',
    '  "caption": "description courte TikTok, max 150 caractères, accrocheuse",',
    '  "hashtags": ["5 hashtags sans #"],',
    '  "keywords": ["6-10 mots-clés visuels en anglais pour stock footage"]',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}
