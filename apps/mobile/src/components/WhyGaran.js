import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Muted, Screen, Segmented } from './ui';
import { colors, radius } from '../lib/theme';
import { FindMyPhone } from './FindMyPhone';

/* ----------------------------- Contenus ----------------------------- */

const CONSUMER = {
  tagline: 'ProtÃ©gez votre tÃ©lÃ©phone contre le vol et la perte â€” et prouvez quâ€™il est Ã  vous.',
  problem:
    'En CÃ´te dâ€™Ivoire et en Afrique de lâ€™Ouest, le vol de tÃ©lÃ©phones est frÃ©quent et souvent violent. Un appareil volÃ© est revendu en quelques heures et devient presque impossible Ã  retrouver.',
  risks: [
    ['ðŸ“µ', 'Sans preuve, un tÃ©lÃ©phone volÃ© est perdu', 'Sans IMEI enregistrÃ© ni certificat, impossible de prouver quâ€™il vous appartient â€” ni Ã  la police, ni au vendeur suivant.'],
    ['ðŸ”', 'Revendu en toute discrÃ©tion', 'Un volÃ© non signalÃ© se revend normalement : le voleur profite, vous perdez tout.'],
    ['ðŸ§¾', 'Le carton se perd', 'La boÃ®te avec lâ€™IMEI finit Ã  la poubelle ; vous nâ€™avez plus rien pour justifier lâ€™achat.']
  ],
  benefits: [
    ['ðŸ”—', 'TÃ©lÃ©phone liÃ© Ã  votre identitÃ©', 'Votre IMEI est rattachÃ© Ã  votre compte. En cas de vol/perte, un seul clic le signale sur tout le rÃ©seau gaRAN : il devient invendable et traÃ§able.'],
    ['ðŸ“œ', 'Certificat de propriÃ©tÃ©', 'Une preuve numÃ©rique que le tÃ©lÃ©phone est Ã  vous, mÃªme sans le carton â€” utile face Ã  la police ou pour une revente honnÃªte.'],
    ['ðŸ”', 'VÃ©rifiez avant dâ€™acheter', 'Avant un achat dâ€™occasion, contrÃ´lez lâ€™IMEI : nâ€™achetez jamais un tÃ©lÃ©phone dÃ©jÃ  signalÃ© volÃ©.'],
    ['â›”', 'Registre rÃ©seau des volÃ©s', 'Consultez la liste des tÃ©lÃ©phones volÃ©s et aidez Ã  les retrouver.'],
    ['ðŸ“', 'Localisez votre tÃ©lÃ©phone', 'gaRAN ne peut pas le localiser Ã  votre place, mais vous guide vers Localiser mon appareil (Android) et Localiser (iPhone) pour le retrouver, le verrouiller ou lâ€™effacer.'],
    ['ðŸ”§', 'RÃ©parations Ã  prix rÃ©duit', 'Tarifs prÃ©fÃ©rentiels chez les rÃ©parateurs partenaires gaRAN.']
  ],
  priceTitle: '125 FCFA / mois',
  priceSub: 'ou lâ€™Ã©quivalent dans votre devise',
  priceLine: 'Le prix dâ€™un bonbon par jourâ€¦ non : par mois. Pour protÃ©ger un tÃ©lÃ©phone qui vaut des dizaines de milliers de francs.',
  cta: 'ProtÃ©ger mon tÃ©lÃ©phone (100 FCFA/mois)'
};

const MERCHANT = {
  tagline: 'Ã‰vitez le piÃ¨ge du tÃ©lÃ©phone volÃ©, protÃ©gez votre commerce et gagnez la confiance de vos clients.',
  problem:
    'La police criminelle (PLCC) traque activement le trafic de tÃ©lÃ©phones volÃ©s : une seule affaire rÃ©cente a menÃ© Ã  la saisie de 115 tÃ©lÃ©phones et 180 millions FCFA. Un revendeur mal outillÃ© est exposÃ©.',
  risks: [
    ['âš–ï¸', 'Recel de bien volÃ© = risque pÃ©nal', 'Racheter ou revendre un tÃ©lÃ©phone volÃ©, mÃªme sans le savoir, peut Ãªtre qualifiÃ© de recel. Les consÃ©quences judiciaires sont rÃ©elles.'],
    ['ðŸ‘®', 'ContrÃ´les et saisies', 'En cas dâ€™enquÃªte, sans registre ni piÃ¨ce du vendeur, vous ne pouvez pas prouver votre bonne foi ; la marchandise peut Ãªtre saisie.'],
    ['ðŸ’¸', 'Perte sÃ¨che', 'Un volÃ© rachetÃ© puis bloquÃ©, câ€™est de lâ€™argent perdu et un client mÃ©content.'],
    ['ðŸ“‰', 'RÃ©putation en jeu', 'Une mauvaise affaire suffit Ã  abÃ®mer la confiance bÃ¢tie avec votre clientÃ¨le.']
  ],
  benefits: [
    ['ðŸ”', 'VÃ©rifiez lâ€™IMEI avant chaque rachat', 'Refusez les tÃ©lÃ©phones signalÃ©s, et gardez la piÃ¨ce dâ€™identitÃ© du vendeur : votre bonne foi est documentÃ©e.'],
    ['ðŸ”’', 'Registre immuable de vos opÃ©rations', 'Chaque vente / rachat / entrÃ©e en stock est horodatÃ© et inviolable â€” votre protection en cas de contrÃ´le.'],
    ['ðŸ¤', 'Donnez toutes les chances Ã  vos clients', 'Neuf, quasi neuf ou occasion : lâ€™IMEI de chaque tÃ©lÃ©phone vendu est enregistrÃ©, afin que le client puisse le retrouver en cas de vol.'],
    ['ðŸš¨', 'DÃ©clarez et consultez les volÃ©s', 'Signalez un vol en un clic et accÃ©dez au registre rÃ©seau des tÃ©lÃ©phones volÃ©s.'],
    ['ðŸ›ï¸', 'Vitrine et reÃ§us pro', 'Vitrine en ligne partageable et reÃ§u professionnel avec code-barres IMEI â€” une image sÃ©rieuse et moderne.']
  ],
  priceTitle: '1 000 FCFA / mois',
  priceSub: 'ou lâ€™Ã©quivalent dans votre devise',
  priceLine: 'Bien moins que le coÃ»t dâ€™un seul litige, dâ€™une saisie ou dâ€™un tÃ©lÃ©phone volÃ© rachetÃ© Ã  perte.',
  cta: 'Mâ€™abonner (1 000 FCFA/mois)'
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
        ? 'Votre conseiller gaRAN active votre abonnement marchand (1 000 FCFA/mois). Le paiement ORZAYAH sera bientÃ´t intÃ©grÃ© directement dans lâ€™app.'
        : 'Lâ€™abonnement usager (100 FCFA/mois) sera rÃ©glable par paiement digital ORZAYAH directement dans lâ€™app. En attendant, rapprochez-vous dâ€™un marchand partenaire gaRAN.',
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
        <Text style={st.sectionLabel}>Le problÃ¨me</Text>
        <Text style={st.problem}>{c.problem}</Text>
      </Card>

      <Text style={st.section}>{selected === 'merchant' ? 'Les risques sans gaRAN' : 'Sans gaRAN, le vol vous coÃ»te tout'}</Text>
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
        Sources : initiative Â« We Care Â» (GSMA, Orange CI, MTN CI, Moov CI, ARTCI) pour le blocage des tÃ©lÃ©phones volÃ©s par IMEI ; Plateforme de Lutte Contre la CybercriminalitÃ© (PLCC), CÃ´te dâ€™Ivoire.
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
