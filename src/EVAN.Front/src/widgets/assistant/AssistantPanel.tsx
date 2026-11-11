/**
 * « Demander à EVAN » : une question en langage naturel sur l'usine (pannes, maintenance, énergie, diagnostic).
 * Claude répond en interrogeant les outils d'EVAN, les mêmes que ceux du serveur MCP : on voit quels outils il a
 * consultés, et ses références (machines, alarmes) s'ouvrent dans l'application. Hors du poste du serveur, le panneau
 * demande le code d'accès avant la première question (le back le vérifie, et limite le débit des questions).
 *
 * Le panneau dit toujours où il en est : vérification de l'assistant, exemples de questions (même hors ligne, pour
 * comprendre à quoi il sert), données consultées pendant la réponse, et une erreur en clair avec de quoi reposer.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { create } from 'zustand';
import { AlertTriangle, ArrowUp, Database, Factory, KeyRound, OctagonAlert, PlugZap, RotateCcw, Square, Wrench, X, Zap } from 'lucide-react';
import { useUi } from '@/store/ui';
import { usePiegeFocus } from '@/ui/usePiegeFocus';
import { useProject } from '@/store/project';
import { useLive } from '@/store/live';
import { getHistory } from '@/sim/history';
import { openReplay, showMachine, focusAlarm } from '@/widgets/shell/navigation';
import { CodeRequis, codeAcces, demander, disponibilite, messageErreur, retenirCode, type AppelOutil, type Disponibilite } from './client';

/** Libellés des outils (mêmes noms que les outils MCP du back), dits comme ce qu'EVAN est allé lire. */
const OUTILS: Record<string, string> = {
  organisation: 'Les usines de l’organisation',
  machines: 'Les machines et leurs organes',
  etat_usine: 'L’état de l’atelier en direct',
  alarmes: 'Le journal des alarmes',
  arrets: 'Les arrêts et l’efficacité des machines',
  chronologie_panne: 'Le déroulé d’une panne',
  carnet_maintenance: 'Le carnet de maintenance',
  energie: 'L’énergie consommée',
  diagnostic_defaut_repetitif: 'Le diagnostic d’un défaut qui revient',
  mesure: 'La courbe d’une mesure',
};

interface Message {
  role: 'user' | 'assistant';
  texte: string;
  outils?: AppelOutil[];
  enCours?: boolean;
  erreur?: string;
  /** Question à l'origine d'une réponse en erreur, pour la reposer d'un clic. */
  question?: string;
}

interface Conversation {
  messages: Message[];
  dispo?: Disponibilite | null;
  /** Code d'accès à saisir : le motif (« Code d'accès requis. », « Code d'accès refusé. »), sinon null. */
  codeRequis: string | null;
  /** Question à reposer une fois le code saisi. */
  aReposer?: string;
}

/** Une question d'exemple : son intitulé court sur la puce, la question complète envoyée. */
interface Suggestion {
  court: string;
  question: string;
}

interface Theme {
  titre: string;
  icone: typeof Wrench;
  suggestions: Suggestion[];
}

/** La conversation survit à la fermeture du panneau, le temps de la visite. */
const useConversation = create<Conversation & { set(p: Partial<Conversation>): void }>()((set) => ({
  messages: [],
  codeRequis: null,
  set: (p) => set(p),
}));

/** Pour la visite guidée : disponibilité connue (undefined tant que la vérification court) et réponse en cours. */
export function etatAssistant(): { dispo?: Disponibilite | null; enCours: boolean } {
  const { messages, dispo } = useConversation.getState();
  return { dispo, enCours: messages.some((m) => m.enCours) };
}

export function AssistantPanel() {
  const ouvert = useUi((s) => s.assistantOuvert);
  if (!ouvert) return null;
  return <Panel />;
}

/** Exemples de questions, rangés par sujet, avec les vraies machines de l'usine ouverte. */
function useThemes(): Theme[] {
  const machines = useProject((s) => s.machines);
  const plusieursUsines = useProject((s) => s.usines.length > 1);
  const flexo = machines.find((m) => m.type === 'flexo') ?? machines[0];
  const themes: Theme[] = [
    {
      titre: 'Pannes et arrêts',
      icone: OctagonAlert,
      suggestions: [
        flexo
          ? { court: `Pourquoi ${flexo.numero} s’est-elle arrêtée ?`, question: `Pourquoi ${flexo.numero} ${flexo.nom} s’est-elle arrêtée ces dernières 24 heures ?` }
          : { court: 'Les pannes des dernières 24 h', question: 'Quelles pannes ces dernières 24 heures ?' },
        { court: 'La machine qui perd le plus de temps', question: 'Quelle machine a perdu le plus de temps en pannes cette semaine, et pourquoi ?' },
        ...(flexo ? [{ court: 'Un défaut revient tous les 339,5 mm', question: `Un défaut revient tous les 339,5 mm sur ${flexo.numero} : quelle pièce ?` }] : []),
      ],
    },
    {
      titre: 'Maintenance',
      icone: Wrench,
      suggestions: [
        { court: 'Les interventions prévues cette semaine', question: 'Qu’est-ce qui est prévu cette semaine en maintenance ?' },
        { court: 'Les entretiens restant à planifier', question: 'Que faut-il encore planifier en maintenance cette semaine ?' },
      ],
    },
    {
      titre: 'Énergie',
      icone: Zap,
      suggestions: [{ court: 'Ce que coûte la veille des machines', question: 'Combien nous coûte la veille des machines par an ?' }],
    },
  ];
  if (plusieursUsines)
    themes.push({ titre: 'Plusieurs usines', icone: Factory, suggestions: [{ court: 'Comparer les usines', question: 'Compare les usines de l’organisation.' }] });
  return themes;
}

function Panel() {
  const { messages, dispo, codeRequis } = useConversation();
  const siteId = useProject((s) => s.activeId);
  const usine = useProject((s) => s.site?.nom);
  const themes = useThemes();
  const [question, setQuestion] = useState('');
  const fil = useRef<HTMLDivElement>(null);
  const panneau = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fermerBtn = useRef<HTMLButtonElement>(null);
  const abort = useRef<AbortController | null>(null);
  const close = () => useUi.getState().setAssistantOuvert(false);
  const enCours = messages.some((m) => m.enCours);
  const verification = dispo === undefined;
  const pret = !!dispo?.disponible && !codeRequis;
  // Piège de focus : le panneau couvre le côté de l'écran, Tab y reste, Échap le ferme et rend le focus au bouton
  // « Demander à EVAN ». Le focus entre par le champ s'il est prêt, sinon par « Fermer » : hors ligne, le champ est
  // grisé et il fallait vingt Tab pour rejoindre le panneau.
  usePiegeFocus(panneau, true, close);

  useEffect(() => {
    // Revérifiée à chaque ouverture tant qu'il est hors ligne : le serveur a pu démarrer entre-temps.
    if (!dispo?.disponible) {
      useConversation.getState().set({ dispo: undefined });
      void disponibilite().then((d) =>
        useConversation.getState().set({ dispo: d, codeRequis: d?.acces === 'code' && !codeAcces() ? 'Code d’accès requis.' : null }),
      );
    }
  }, []);

  // L'assistant devient prêt après l'ouverture (vérification faite, code saisi) : le focus passe de « Fermer » au champ.
  useEffect(() => {
    if (pret && (document.activeElement === fermerBtn.current || document.activeElement === document.body)) input.current?.focus();
  }, [pret]);

  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const poser = async (texte: string) => {
    const q = texte.trim();
    if (!q || enCours) return;
    setQuestion('');
    const historique = useConversation.getState().messages.filter((m) => !m.erreur);
    const suivants: Message[] = [...historique, { role: 'user', texte: q }, { role: 'assistant', texte: '', outils: [], enCours: true, question: q }];
    useConversation.getState().set({ messages: suivants });
    const maj = (f: (m: Message) => Message) => {
      const list = useConversation.getState().messages;
      useConversation.getState().set({ messages: [...list.slice(0, -1), f(list[list.length - 1])] });
    };
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      await demander(
        siteId,
        [...historique.map((m) => ({ role: m.role, texte: m.texte })), { role: 'user' as const, texte: q }],
        {
          outil: (a) => maj((m) => ({ ...m, outils: [...(m.outils ?? []), a] })),
          texte: (d) => maj((m) => ({ ...m, texte: m.texte + d })),
        },
        ctrl.signal,
      );
      maj((m) => ({ ...m, enCours: false }));
    } catch (e) {
      if (e instanceof CodeRequis) {
        // La question n'est pas partie : on la retire du fil, elle sera reposée une fois le code saisi.
        useConversation.getState().set({ messages: historique, codeRequis: e.message, aReposer: q });
        return;
      }
      const arrete = ctrl.signal.aborted;
      maj((m) => ({ ...m, enCours: false, erreur: arrete ? undefined : messageErreur(e), texte: m.texte || (arrete ? 'Réponse arrêtée.' : '') }));
    } finally {
      abort.current = null;
    }
  };

  /** Reposer une question restée sans réponse : la paire question et erreur quitte le fil, la question repart. */
  const reposer = (q: string) => {
    const list = useConversation.getState().messages;
    useConversation.getState().set({ messages: list.slice(0, -2) });
    void poser(q);
  };

  const validerCode = (code: string) => {
    retenirCode(code);
    const { aReposer } = useConversation.getState();
    useConversation.getState().set({ codeRequis: null, aReposer: undefined });
    if (aReposer) void poser(aReposer);
    else input.current?.focus();
  };
  // Visite guidée : une question posée comme si on cliquait une suggestion.
  const poserRef = useRef(poser);
  poserRef.current = poser;
  useEffect(() => {
    const h = (e: Event) => void poserRef.current((e as CustomEvent<string>).detail);
    window.addEventListener('evan:assistant-ask', h);
    return () => window.removeEventListener('evan:assistant-ask', h);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void poser(question);
  };

  return (
    <aside ref={panneau} className="assistant" role="dialog" aria-modal="true" aria-label="Demander à EVAN">
      <header className="assistant-head">
        <div className="grow" style={{ minWidth: 0 }}>
          <b>Demander à EVAN</b>
          <span className="faint truncate">{usine ? `Questions sur ${usine}` : 'Questions sur l’usine'}</span>
        </div>
        {messages.length > 0 && (
          <button className="btn sm icon ghost" onClick={() => useConversation.getState().set({ messages: [] })} title="Effacer et repartir d’une page blanche" aria-label="Nouvelle conversation" disabled={enCours}>
            <RotateCcw />
          </button>
        )}
        <button ref={fermerBtn} data-autofocus={pret ? undefined : true} className="btn sm icon ghost" onClick={close} aria-label="Fermer l’assistant" title="Fermer (Échap)">
          <X />
        </button>
      </header>

      <div className="assistant-fil" ref={fil} aria-live="polite" aria-busy={verification || enCours}>
        {verification && <Verification />}
        {dispo === null && <Indisponible />}
        {dispo && !dispo.disponible && <Indisponible raison={dispo.raison} mcp={dispo.mcp} ferme={dispo.acces === 'ferme'} />}
        {dispo?.disponible && codeRequis && <CodeAcces motif={codeRequis} onCode={validerCode} />}
        {!messages.length && !verification && <Accueil themes={themes} pret={pret} poser={(q) => void poser(q)} />}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="bulle user">
              {m.texte}
            </div>
          ) : (
            <div key={i} className="bulle evan">
              {!!m.outils?.length && (
                <details className="assistant-outils" open={m.enCours}>
                  <summary>
                    <Database aria-hidden /> {m.enCours ? 'EVAN lit' : 'EVAN a lu'} {m.outils.length} source{m.outils.length > 1 ? 's' : ''} de données
                  </summary>
                  <ul>
                    {m.outils.map((o, k) => (
                      <li key={k}>
                        <b>{OUTILS[o.nom] ?? o.nom}</b> <span className="mono faint">{resumeArguments(o.arguments)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {m.texte ? <Riche texte={m.texte} /> : m.enCours ? <Attente /> : null}
              {m.erreur && (
                <div className="assistant-erreur" role="alert">
                  <AlertTriangle aria-hidden />
                  <div>
                    <p>{m.erreur}</p>
                    {m.question && i === messages.length - 1 && (
                      <button className="btn sm" onClick={() => reposer(m.question!)} disabled={!pret}>
                        <RotateCcw /> Reposer la question
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <form className="assistant-form" onSubmit={submit}>
        <textarea
          ref={input}
          data-autofocus={pret ? true : undefined}
          className="input"
          rows={2}
          value={question}
          placeholder={pret ? 'Votre question sur l’usine' : verification ? 'Vérification de l’assistant…' : codeRequis && dispo?.disponible ? 'Saisissez d’abord le code d’accès' : 'Assistant hors ligne'}
          disabled={!pret}
          maxLength={dispo?.caracteresMax ?? 4000}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void poser(question);
            }
          }}
          aria-label="Votre question"
        />
        {enCours ? (
          <button type="button" className="btn icon" onClick={() => abort.current?.abort()} aria-label="Arrêter la réponse" title="Arrêter la réponse">
            <Square />
          </button>
        ) : (
          <button type="submit" className="btn icon primary" disabled={!question.trim() || !pret} aria-label="Envoyer la question" title="Envoyer (Entrée)">
            <ArrowUp />
          </button>
        )}
      </form>
      <p className="assistant-pied faint">
        {dispo?.disponible ? (
          <>
            Réponses de {dispo.modele ?? 'Claude'}, tirées des données d’EVAN.{' '}
            <span className="assistant-touches">
              <kbd className="kbd">Entrée</kbd> pour envoyer,
            </span>{' '}
            <span className="assistant-touches">
              <kbd className="kbd">Maj</kbd> + <kbd className="kbd">Entrée</kbd> pour aller à la ligne
            </span>
          </>
        ) : (
          'Les réponses viennent des données d’EVAN : historique, maintenance, énergie et direct.'
        )}
      </p>
    </aside>
  );
}

/** Ce qu'on peut demander : une phrase, puis des exemples en puces, rangés par sujet. Hors ligne, les puces restent
 * visibles (grisées) pour montrer à quoi sert l'assistant. */
function Accueil({ themes, pret, poser }: { themes: Theme[]; pret: boolean; poser(q: string): void }) {
  return (
    <div className="assistant-intro">
      {/* Hors ligne, on ne peut rien poser : la phrase dit ce qu'il fera une fois branché. */}
      <p>
        {pret
          ? 'Posez une question en français sur l’usine. EVAN cherche la réponse dans ses données et cite ses sources : un clic sur une machine ou une alarme citée l’ouvre dans l’application.'
          : 'Une fois branché, l’assistant répond en français aux questions sur l’usine. Il cherche dans les données d’EVAN et cite ses sources : un clic sur une machine ou une alarme citée l’ouvre dans l’application.'}
      </p>
      <h3>{pret ? 'Par exemple' : 'Ce qu’il saura vous dire une fois branché'}</h3>
      {themes.map((t, i) => (
        <section key={t.titre} className="assistant-theme" style={{ ['--i' as string]: i }}>
          <h4>
            <t.icone aria-hidden /> {t.titre}
          </h4>
          <div className="assistant-puces">
            {t.suggestions.map((s) => (
              <button key={s.court} className="assistant-puce" onClick={() => poser(s.question)} disabled={!pret} title={s.question}>
                {s.court}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Pendant la vérification de l'assistant (1,5 s au plus) : on le dit, et la place des exemples est déjà là. */
function Verification() {
  return (
    <div className="assistant-verif" role="status">
      <span className="assistant-points" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      EVAN vérifie que l’assistant est joignable…
      <div className="assistant-squelette" aria-hidden>
        <i style={{ width: '62%' }} />
        <i style={{ width: '48%' }} />
        <i style={{ width: '70%' }} />
      </div>
    </div>
  );
}

/** Réponse en préparation, avant le premier mot. */
function Attente() {
  return (
    <span className="assistant-attente" role="status">
      <span className="assistant-points" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      EVAN cherche dans les données de l’usine…
    </span>
  );
}

/**
 * Code d'accès demandé par le back : l'assistant dépense la clé Claude du serveur, il ne répond donc au réseau qu'avec
 * le code fourni par l'administrateur d'EVAN. Gardé le temps de l'onglet.
 */
function CodeAcces({ motif, onCode }: { motif: string; onCode(code: string): void }) {
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) onCode(code.trim());
  };
  return (
    <form className="assistant-etat" onSubmit={submit}>
      <span className="assistant-etat-icone" aria-hidden>
        <KeyRound />
      </span>
      <div>
        <b>{motif}</b>
        <p>Depuis un autre poste que le serveur, l’assistant demande le code donné par l’administrateur d’EVAN. Il est oublié à la fermeture de l’onglet.</p>
        <div className="assistant-code">
          <input
            className="input"
            type="password"
            autoComplete="off"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code d’accès"
            aria-label="Code d’accès"
          />
          <button type="submit" className="btn primary" disabled={!code.trim()}>
            Valider
          </button>
        </div>
      </div>
    </form>
  );
}

/** Assistant hors ligne : une phrase pour l'utilisateur, la marche à suivre technique repliée. */
function Indisponible({ raison, mcp, ferme }: { raison?: string; mcp?: string; ferme?: boolean }) {
  return (
    <div className="assistant-etat hors-ligne" role="status">
      <span className="assistant-etat-icone" aria-hidden>
        <PlugZap />
      </span>
      <div>
        <b>L’assistant n’est pas branché ici</b>
        <p>
          {ferme
            ? 'Il ne répond que sur le poste du serveur EVAN : depuis ce poste, aucun code ne l’ouvre.'
            : 'Il a besoin du serveur EVAN et d’une clé Claude, que seul l’administrateur peut ajouter. Le reste de l’application fonctionne normalement.'}
        </p>
        <details className="assistant-off-details">
          <summary>Pour l’administrateur</summary>
          <p>
            {raison ??
              'La clé de l’API Claude reste sur le serveur : lancez la chaîne complète (scripts/dev.ps1) avec la variable ANTHROPIC_API_KEY.'}
          </p>
          <p>Les mêmes outils sont ouverts en MCP sur {mcp ?? 'http://localhost:8080/mcp'} : Claude Desktop ou Claude Code peuvent interroger EVAN directement.</p>
        </details>
      </div>
    </div>
  );
}

function resumeArguments(a: Record<string, unknown>): string {
  return Object.entries(a)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' · ');
}

/** Liens de l'assistant vers l'application : [R01](machine:m-r01), [EM-01](alarme:h-m-r01-…). */
function suivre(cible: string) {
  const [type, id] = cible.split(':');
  if (type === 'machine') {
    useUi.getState().setAssistantOuvert(false);
    void showMachine(id);
    return;
  }
  if (type === 'alarme') {
    const machines = useProject.getState().machines;
    const a = getHistory(machines).alarmes.find((x) => x.id === id) ?? useLive.getState().alarms.find((x) => x.id === id);
    if (!a) {
      useLive.getState().pushToast({ gravite: 'info', titre: 'Alarme d’une autre usine', texte: 'Ouvrez son usine pour la revoir.' });
      return;
    }
    if (a.statut === 'resolue') openReplay(a);
    else {
      useUi.getState().setAssistantOuvert(false);
      focusAlarm(a.id);
    }
  }
}

/** Rendu du texte de l'assistant : paragraphes, listes, gras, code et liens internes ; aucun HTML interprété. */
function Riche({ texte }: { texte: string }) {
  const blocs = texte.replace(/\r/g, '').split(/\n{2,}/);
  return (
    <div className="riche">
      {blocs.map((b, i) => {
        const lignes = b.split('\n');
        if (lignes.every((l) => /^\s*[-*•] /.test(l))) return <ul key={i}>{lignes.map((l, k) => <li key={k}>{enLigne(l.replace(/^\s*[-*•] /, ''))}</li>)}</ul>;
        if (lignes.every((l) => /^\s*\d+[.)] /.test(l))) return <ol key={i}>{lignes.map((l, k) => <li key={k}>{enLigne(l.replace(/^\s*\d+[.)] /, ''))}</li>)}</ol>;
        const titre = /^#{1,4} (.*)$/.exec(lignes[0]);
        if (titre && lignes.length === 1) return <h4 key={i}>{enLigne(titre[1])}</h4>;
        return (
          <p key={i}>
            {lignes.map((l, k) => (
              <span key={k}>
                {k > 0 && <br />}
                {enLigne(l.replace(/^#{1,4} /, ''))}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function enLigne(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<b key={m.index}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) out.push(<code key={m.index}>{t.slice(1, -1)}</code>);
    else {
      const [, label, cible] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      if (/^(machine|alarme):/.test(cible))
        out.push(
          <button key={m.index} className={`lien-evan ${cible.split(':')[0]}`} onClick={() => suivre(cible)}>
            {label}
          </button>,
        );
      else if (/^https?:\/\//.test(cible))
        out.push(
          <a key={m.index} href={cible} target="_blank" rel="noreferrer">
            {label}
          </a>,
        );
      else out.push(label);
    }
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
