import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Muted, Screen, Segmented } from './ui';
import { colors, radius } from '../lib/theme';
import { FindMyPhone } from './FindMyPhone';

/* ----------------------------- Contenus ----------------------------- */

const CONSUMER = {
  tagline: 'Protégez votre téléphone contre le vol et la perte — et prouvez qu’il est à vous.',
  problem:
    'En Côte d’Ivoire et en Afrique de l’Ouest, le vol de téléphones est fréquent et souvent violent. Un appareil volé est revendu en quelques heures et devient presque impossible à retrouver.',
  risks: [
    ['📵', 'Sans preuve, un téléphone volé est perdu', 'Sans IMEI enregistré ni certificat, impossible de prouver qu’il vous appartient — ni à la police, ni au vendeur suivant.'],
    ['🔁', 'Revendu en toute discrétion', 'Un volé non signalé se revend normalement : le voleur profite, vous perdez tout.'],
    ['🧾', 'Le carton se perd', 'La boîte avec l’IMEI finit à la poubelle ; vous n’avez plus rien pour justifier l’achat.']
  ],
  benefits: [
    ['🔗', 'Téléphone lié à votre identité', 'Votre IMEI est rattaché à votre compte. En cas de vol/perte, un seul clic le signale sur tout le réseau gaRAN : il devient invendable et traçable.'],
    ['📜', 'Certificat de propriété', 'Une preuve numérique que le téléphone est à vous, même sans le carton — utile face à la police ou pour une revente honnête.'],
    ['🔍', 'Vérifiez avant d’acheter', 'Avant un achat d’occasion, contrôlez l’IMEI : n’achetez jamais un téléphone déjà signalé volé.'],
    ['⛔', 'Registre réseau des volés', 'Consultez la liste des téléphones volés et aidez à les retrouver.'],
    ['📍', 'Localisez votre téléphone', 'gaRAN ne peut pas le localiser à votre place, mais vous guide vers Localiser mon appareil (Android) et Localiser (iPhone) pour le retrouver, le verrouiller ou l’effacer.'],
    ['🔧', 'Réparations à prix réduit', 'Tarifs préférentiels chez les réparateurs partenaires gaRAN.']
  ],
  priceTitle: '100 FCFA / mois',
  priceSub: 'ou l’équivalent dans votre devise',
  priceLine: 'Le prix d’un bonbon par jour… non : par mois. Pour protéger un téléphone qui vaut des dizaines de milliers de francs.',
  cta: 'Protéger mon téléphone (100 FCFA/mois)'
};

const MERCHANT = {
  tagline: 'Évitez le piège du téléphone volé, protégez votre commerce et gagnez la confiance de vos clients.',
  problem:
    'La police criminelle (PLCC) traque activement le trafic de téléphones volés : une seule affaire récente a mené à la saisie de 115 téléphones et 180 millions FCFA. Un revendeur mal outillé est exposé.',
  risks: [
    ['⚖️', 'Recel de bien volé = risque pénal', 'Racheter ou revendre un téléphone volé, même sans le savoir, peut être qualifié de recel. Les conséquences judiciaires sont réelles.'],
    ['👮', 'Contrôles et saisies', 'En cas d’enquête, sans registre ni pièce du vendeur, vous ne pouvez pas prouver votre bonne foi ; la marchandise peut être saisie.'],
    ['💸', 'Perte sèche', 'Un volé racheté puis bloqué, c’est de l’argent perdu et un client mécontent.'],
    ['📉', 'Réputation en jeu', 'Une mauvaise affaire suffit à abîmer la confiance bâtie avec votre clientèle.']
  ],
  benefits: [
    ['🔍', 'Vérifiez l’IMEI avant chaque rachat', 'Refusez les téléphones signalés, et gardez la pièce d’identité du vendeur : votre bonne foi est documentée.'],
    ['🔒', 'Registre immuable de vos opérations', 'Chaque vente / rachat / entrée en stock est horodaté et inviolable — votre protection en cas de contrôle.'],
    ['🤝', 'Donnez toutes les chances à vos clients', 'Neuf, quasi neuf ou occasion : l’IMEI de chaque téléphone vendu est enregistré, afin que le client puisse le retrouver en cas de vol.'],
    ['🚨', 'Déclarez et consultez les volés', 'Signalez un vol en un clic et accédez au registre réseau des téléphones volés.'],
    ['🛍️', 'Vitrine et reçus pro', 'Vitrine en ligne partageable et reçu professionnel avec code-barres IMEI — une image sérieuse et moderne.']
  ],
  priceTitle: '1 000 FCFA / mois',
  priceSub: 'ou l’équivalent dans votre devise',
  priceLine: 'Bien moins que le coût d’un seul litige, d’une saisie ou d’un téléphone volé racheté à perte.',
  cta: 'M’abonner (1 000 FCFA/mois)'
};

function Block({ icon, title, text, tone }) {
  return (
    <View style={[st.block, { borderLeftColor: tone }]}>
      <Text style={st.blockIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={st.blockTitle}>{title}</Text>
        <Text style={st.blockText}>{text}</Text>
      </View>
    </View>
  );
}

export function WhyGaran({ role = 'consumer', lockRole = false, onSubscribe }) {
  const [selected, setSelected] = useState(role);
  const c = selected === 'merchant' ? MERCHANT : CONSUMER;

  function subscribe() {
    if (onSubscribe) return onSubscribe(selected);
    Alert.alert(
      'Activer mon abonnement',
      selected === 'merchant'
        ? 'Votre conseiller gaRAN active votre abonnement marchand (1 000 FCFA/mois). Le paiement ORZAYAH sera bientôt intégré directement dans l’app.'
        : 'L’abonnement usager (100 FCFA/mois) sera réglable par paiement digital ORZAYAH directement dans l’app. En attendant, rapprochez-vous d’un marchand partenaire gaRAN.',
      [{ text: 'Compris' }]
    );
  }

  return (
    <Screen>
      <View style={st.hero}>
        <Text style={st.heroTitle}>Pourquoi gaRAN ?</Text>
        <Text style={st.heroTag}>{c.tagline}</Text>
      </View>

      {!lockRole ? (
        <Segmented
          value={selected}
          onChange={setSelected}
          options={[{ value: 'consumer', label: 'Je suis usager' }, { value: 'merchant', label: 'Je suis marchand' }]}
        />
      ) : null}

      <Card style={{ backgroundColor: colors.bloodBg, borderLeftWidth: 5, borderLeftColor: colors.blood }}>
        <Text style={st.sectionLabel}>Le problème</Text>
        <Text style={st.problem}>{c.problem}</Text>
      </Card>

      <Text style={st.section}>{selected === 'merchant' ? 'Les risques sans gaRAN' : 'Sans gaRAN, le vol vous coûte tout'}</Text>
      {c.risks.map((r) => <Block key={r[1]} icon={r[0]} title={r[1]} text={r[2]} tone={colors.danger} />)}

      <Text style={st.section}>Ce que gaRAN vous apporte</Text>
      {c.benefits.map((b) => <Block key={b[1]} icon={b[0]} title={b[1]} text={b[2]} tone={colors.green} />)}

      {selected === 'consumer' ? <FindMyPhone mode="prevention" /> : null}
      <View style={st.price}>
        <Text style={st.priceLabel}>Votre abonnement</Text>
        <Text style={st.priceValue}>{c.priceTitle}</Text>
        <Text style={st.priceSub}>{c.priceSub}</Text>
        <Text style={st.priceLine}>{c.priceLine}</Text>
      </View>

      <Button title={c.cta} onPress={subscribe} />
      <Muted style={{ textAlign: 'center', fontSize: 11.5 }}>
        Sources : initiative « We Care » (GSMA, Orange CI, MTN CI, Moov CI, ARTCI) pour le blocage des téléphones volés par IMEI ; Plateforme de Lutte Contre la Cybercriminalité (PLCC), Côte d’Ivoire.
      </Muted>
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { alignItems: 'center', gap: 4, paddingVertical: 4 },
  heroTitle: { fontSize: 26, fontWeight: '900', color: colors.ink },
  heroTag: { fontSize: 14, color: colors.ink2, textAlign: 'center' },
  section: { fontSize: 13, fontWeight: '800', color: colors.ink2, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: colors.blood, textTransform: 'uppercase', letterSpacing: 0.5 },
  problem: { fontSize: 14, color: colors.ink, lineHeight: 20, marginTop: 4 },
  block: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, padding: 14 },
  blockIcon: { fontSize: 22 },
  blockTitle: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  blockText: { fontSize: 13, color: colors.ink2, lineHeight: 19, marginTop: 2 },
  price: { backgroundColor: colors.green, borderRadius: radius.lg, padding: 20, alignItems: 'center', gap: 2, marginTop: 6 },
  priceLabel: { color: '#042f1f', fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  priceValue: { color: '#042a1c', fontSize: 34, fontWeight: '900' },
  priceSub: { color: '#063d29', fontSize: 13 },
  priceLine: { color: '#063d29', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 }
});
