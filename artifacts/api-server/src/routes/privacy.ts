import { Router, type IRouter } from "express";

const router: IRouter = Router();

const UPDATED_AT = "1er août 2026";

const PRIVACY_HTML = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Politique de confidentialité — Forge &amp; Kingdoms</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 20px 64px;
      line-height: 1.65;
      color: #2b2115;
      background: #faf6ef;
    }
    @media (prefers-color-scheme: dark) {
      body { color: #e8e0d2; background: #1a1208; }
      a { color: #e0a94e; }
      h1, h2 { color: #e0a94e; }
    }
    h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.15rem; margin-top: 2rem; }
    .updated { opacity: 0.7; font-size: 0.9rem; margin-bottom: 2rem; }
    ul { padding-left: 1.25rem; }
    li { margin: 0.35rem 0; }
  </style>
</head>
<body>
  <h1>Politique de confidentialité</h1>
  <p class="updated">Forge &amp; Kingdoms — Dernière mise à jour : ${UPDATED_AT}</p>

  <p>
    Cette politique de confidentialité décrit les données traitées par le jeu mobile
    <strong>Forge &amp; Kingdoms</strong> (« le jeu », « nous ») et la manière dont elles sont utilisées.
    Nous collectons le strict minimum nécessaire au fonctionnement du jeu : aucune création de compte,
    aucune adresse e-mail, aucun nom réel et aucune donnée de localisation ne sont demandés.
  </p>

  <h2>1. Données que nous collectons</h2>
  <ul>
    <li>
      <strong>Identifiant anonyme d'appareil (RevenueCat)</strong> — pour gérer les achats intégrés et
      l'abonnement, notre prestataire RevenueCat génère un identifiant anonyme et aléatoire propre à
      votre appareil. Il ne permet pas de vous identifier personnellement.
    </li>
    <li>
      <strong>Sauvegarde cloud</strong> — votre progression de jeu (niveaux, inventaire, or, talents,
      scores) est enregistrée sur nos serveurs, associée uniquement à un identifiant anonyme. Elle ne
      contient aucune donnée personnelle.
    </li>
    <li>
      <strong>Historique d'achats</strong> — les reçus d'achats intégrés sont traités par Apple
      (App Store), Google (Google Play) et RevenueCat afin de valider et restaurer vos achats.
    </li>
  </ul>
  <p>
    Nous ne collectons pas : nom, adresse e-mail, numéro de téléphone, contacts, photos,
    localisation, ni aucune donnée publicitaire de suivi inter-applications.
  </p>

  <h2>2. Achats intégrés et abonnement Forge Premium</h2>
  <p>
    Le jeu propose des achats intégrés (packs d'or) et un abonnement mensuel à renouvellement
    automatique, <strong>Forge Premium</strong>. Les paiements sont traités exclusivement par
    l'App Store d'Apple ou par Google Play : nous n'avons jamais accès à vos informations
    bancaires. RevenueCat traite les reçus d'achat en notre nom pour activer vos avantages et
    permettre la restauration des achats. L'abonnement peut être annulé à tout moment dans les
    réglages d'abonnement de votre store, au moins 24 heures avant la fin de la période en cours.
  </p>

  <h2>3. Partage des données</h2>
  <p>
    Nous ne vendons ni ne louons aucune donnée. Les seuls tiers recevant des données sont :
  </p>
  <ul>
    <li><strong>RevenueCat</strong> (gestion des achats) — <a href="https://www.revenuecat.com/privacy">politique de confidentialité RevenueCat</a> ;</li>
    <li><strong>Apple / Google</strong> (traitement des paiements et distribution de l'app).</li>
  </ul>

  <h2>4. Conservation et suppression</h2>
  <p>
    Les sauvegardes cloud sont conservées tant que vous jouez. Vous pouvez demander la suppression
    de votre sauvegarde et des données associées en nous contactant (voir ci-dessous) ; la
    suppression est effectuée sous 30 jours.
  </p>

  <h2>5. Enfants</h2>
  <p>
    Le jeu ne collecte aucune donnée personnelle permettant d'identifier un enfant. Les achats
    intégrés sont soumis aux contrôles parentaux de l'App Store et de Google Play.
  </p>

  <h2>6. Modifications</h2>
  <p>
    Toute modification de cette politique sera publiée sur cette page avec une nouvelle date de
    mise à jour.
  </p>

  <h2>7. Contact</h2>
  <p>
    Pour toute question ou demande relative à vos données :
    <a href="mailto:support@forgeandkingdoms.app">support@forgeandkingdoms.app</a>
  </p>
</body>
</html>
`;

router.get("/privacy", (_req, res) => {
  res.type("html").send(PRIVACY_HTML);
});

export default router;
