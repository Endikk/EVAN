/**
 * Le kit pour rendre chaque écran compréhensible par tous : verdict en clair, repères, mots expliqués, guide.
 * Ses styles (explain.css) sont chargés une fois pour toute l'application, dans app/main.tsx.
 */
export { PageIntro, TonGlyph, type Ton } from './PageIntro';
export { Repere } from './Repere';
export { Details } from './Details';
export { StepGuide, type Tache } from './StepGuide';
export { Term, DefinitionTerme } from './Term';
export { GuideButton, montrerBloc, type GuideEcran, type GuideBloc } from './Guide';
export { GLOSSAIRE, type TermeCle, type Terme } from './glossaire';
export { lireEfficacite, EFFICACITE_REFERENCE, type Lecture } from './lecture';
export { ChiffresSecondaires, TitreCarte, type ChiffreSecondaire } from './Compact';
