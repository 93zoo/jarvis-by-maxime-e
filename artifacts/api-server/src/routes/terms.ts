import { Router, type IRouter } from "express";

const router: IRouter = Router();

const UPDATED_AT = "2 août 2026";

const TERMS_HTML = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Conditions d'utilisation — Forge &amp; Kingdoms</title>
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
  <h1>Conditions d'utilisation</h1>
  <p class="updated">Forge &amp; Kingdoms — Dernière mise à jour : ${UPDATED_AT}</p>

  <p>
    Les présentes conditions d'utilisation (« CGU ») régissent l'accès et l'utilisation du jeu mobile
    <strong>Forge &amp; Kingdoms</strong> (« le jeu », « nous »). En téléchargeant ou en utilisant
    le jeu, vous acceptez ces conditions dans leur intégralité. Si vous n'êtes pas d'accord avec
    l'une de ces conditions, veuillez désinstaller le jeu et cesser de l'utiliser.
  </p>

  <h2>1. Licence d'utilisation</h2>
  <p>
    Nous vous accordons une licence personnelle, non exclusive, non transférable et révocable pour
    utiliser le jeu à des fins personnelles et non commerciales, conformément aux présentes CGU et
    aux règles de l'App Store (Apple) ou de Google Play, selon la plateforme utilisée. Cette licence
    ne vous transfère aucun droit de propriété sur le jeu ou son contenu.
  </p>

  <h2>2. Abonnement Forge Premium</h2>
  <p>
    Le jeu propose un abonnement mensuel à renouvellement automatique appelé <strong>Forge
    Premium</strong>. Les modalités suivantes s'appliquent :
  </p>
  <ul>
    <li>
      <strong>Facturation</strong> — le montant de l'abonnement est débité sur votre compte
      App Store (Apple) ou Google Play à la confirmation de l'achat, puis automatiquement à chaque
      renouvellement mensuel.
    </li>
    <li>
      <strong>Renouvellement automatique</strong> — l'abonnement se renouvelle automatiquement
      à la fin de chaque période, sauf annulation au moins 24 heures avant la date de fin de la
      période en cours.
    </li>
    <li>
      <strong>Annulation</strong> — vous pouvez annuler l'abonnement à tout moment depuis les
      réglages d'abonnement de votre store (App Store ou Google Play). L'annulation prend effet
      à la fin de la période en cours ; aucun remboursement partiel n'est effectué pour la
      période restante.
    </li>
    <li>
      <strong>Remboursements</strong> — toute demande de remboursement est traitée conformément
      à la politique de remboursement d'Apple ou de Google. Nous n'avons pas accès à vos
      informations de paiement et ne traitons pas les remboursements directement.
    </li>
    <li>
      <strong>Restauration des achats</strong> — si vous réinstallez le jeu ou changez d'appareil,
      utilisez la fonction « Restaurer les achats » disponible dans la boutique du jeu pour
      récupérer vos avantages Premium.
    </li>
    <li>
      <strong>Prix</strong> — le prix de l'abonnement est indiqué dans la boutique du jeu avant
      toute confirmation d'achat. Nous nous réservons le droit de modifier le prix en vous en
      informant à l'avance conformément aux règles de votre store.
    </li>
  </ul>

  <h2>3. Achats intégrés (packs d'or)</h2>
  <p>
    Le jeu propose des achats uniques de packs d'or. Ces achats sont définitifs et non remboursables
    une fois la monnaie virtuelle consommée dans le jeu. La monnaie virtuelle n'a aucune valeur
    monétaire réelle et ne peut pas être échangée contre de l'argent réel.
  </p>

  <h2>4. Contenu et propriété intellectuelle</h2>
  <p>
    Tout le contenu du jeu (graphismes, musiques, textes, code, noms, personnages, mécaniques de
    jeu) est la propriété exclusive de ses créateurs ou est utilisé sous licence. Vous n'êtes pas
    autorisé à copier, modifier, distribuer, vendre ou exploiter ce contenu à des fins commerciales.
  </p>

  <h2>5. Comportement de l'utilisateur</h2>
  <p>
    Vous vous engagez à utiliser le jeu de manière licite et à ne pas tenter de contourner,
    modifier ou altérer les mécanismes du jeu, notamment par l'utilisation de logiciels tiers,
    de triche ou de manipulation des données de sauvegarde.
  </p>

  <h2>6. Disponibilité et modifications</h2>
  <p>
    Nous nous réservons le droit de modifier, suspendre ou interrompre le jeu ou certaines
    fonctionnalités à tout moment, sans préavis. En cas de modification substantielle des
    présentes CGU, une notification sera publiée dans le jeu ou sur cette page.
  </p>

  <h2>7. Limitation de responsabilité</h2>
  <p>
    Dans les limites autorisées par la loi applicable, le jeu est fourni « en l'état », sans
    garantie d'aucune sorte. Nous ne saurions être tenus responsables des interruptions de service,
    des pertes de progression dues à une défaillance technique ou de tout dommage indirect lié
    à l'utilisation du jeu.
  </p>

  <h2>8. Droit applicable</h2>
  <p>
    Les présentes CGU sont soumises au droit français. En cas de litige, les parties s'engagent
    à rechercher une solution amiable avant tout recours judiciaire.
  </p>

  <h2>9. Contact</h2>
  <p>
    Pour toute question relative aux présentes conditions d'utilisation ou à l'abonnement Forge Premium :
    <a href="mailto:support@forgeandkingdoms.app">support@forgeandkingdoms.app</a>
  </p>
</body>
</html>
`;

router.get("/terms", (_req, res) => {
  res.type("html").send(TERMS_HTML);
});

export default router;
