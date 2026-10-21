import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Muted, Segmented } from './ui';
import { colors, radius } from '../lib/theme';

/**
 * Bloc « Localiser mon téléphone ».
 * gaRAN ne localise pas les téléphones : ce bloc guide le propriétaire vers les services
 * officiels (Google / Apple), qui fonctionnent avec son propre compte.
 *   mode="prevention" : avant un vol (sensibilisation)
 *   mode="theft"      : au moment de la déclaration d'un vol ou d'une perte
 */

const TARGETS = {
  android: {
    url: 'https://www.google.com/android/find',
    cta: 'Ouvrir Localiser mon appareil (Google)'
  },
  ios: {
    url: 'https://www.icloud.com/find',
    cta: 'Ouvrir Localiser (iCloud)'
  }
};

const STEPS = {
  theft: {
    android: [
      'Ouvrez le lien et connectez-vous avec le compte Google du téléphone.',
      'Si le téléphone apparaît : verrouillez-le et affichez un message avec un numéro où vous joindre.',
      'N’effacez pas l’appareil avant d’avoir déposé plainte : une fois effacé, vous ne pouvez plus le localiser.',
      'Déposez plainte avec l’IMEI et transmettez la position à la police. Ne tentez pas de le récupérer vous-même.'
    ],
    ios: [
      'Ouvrez le lien et connectez-vous avec l’identifiant Apple du téléphone.',
      'Activez le mode Perdu : l’appareil est verrouillé et affiche un message avec votre numéro.',
      'N’effacez pas l’appareil avant d’avoir déposé plainte : une fois effacé, vous ne pouvez plus le localiser.',
      'Déposez plainte avec l’IMEI et transmettez la position à la police. Ne tentez pas de le récupérer vous-même.'
    ]
  },
  prevention: {
    android: [
      'Activez la localisation du téléphone.',
      'Vérifiez que « Localiser mon appareil » est activé et que le téléphone est relié à un compte Google.',
      'Définissez un verrouillage d’écran (code, schéma ou empreinte).',
      'Gardez votre IMEI dans gaRAN pour pouvoir déclarer un vol en un clic.'
    ],
    ios: [
      'Activez « Localiser mon iPhone » (Réglages, votre nom, Localiser).',
      'Activez aussi « Réseau Localiser » et « Envoyer la dernière position ».',
      'Définissez un code de verrouillage (et Face ID ou Touch ID).',
      'Gardez votre IMEI dans gaRAN pour pouvoir déclarer un vol en un clic.'
    ]
  }
};

function openUrl(url) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

export function FindMyPhone({ mode = 'theft' }) {
  const [os, setOs] = useState(Platform.OS === 'ios' ? 'ios' : 'android');
  const theft = mode === 'theft';
  const target = TARGETS[os];
  const steps = STEPS[mode][os];

  return (
    <Card style={theft ? { borderLeftWidth: 5, borderLeftColor: colors.blood } : { borderLeftWidth: 5, borderLeftColor: colors.green }}>
      <Text style={st.title}>📍 Localiser mon téléphone</Text>
      <Muted>
        {theft
          ? 'Tant que le téléphone est allumé et connecté à Internet, vous pouvez peut-être le retrouver vous-même.'
          : 'Activez dès maintenant ce qui permettra de retrouver votre téléphone en cas de vol.'}
      </Muted>

      <Segmented
        value={os}
        onChange={setOs}
        options={[{ value: 'android', label: 'Android' }, { value: 'ios', label: 'iPhone' }]}
      />

      {steps.map((text, i) => (
        <View key={text} style={st.row}>
          <View style={st.num}>
            <Text style={st.numText}>{i + 1}</Text>
          </View>
          <Text style={st.stepText}>{text}</Text>
        </View>
      ))}

      {theft ? <Button title={target.cta} onPress={() => openUrl(target.url)} /> : <Button title={target.cta} variant="secondary" onPress={() => openUrl(target.url)} />}

      <Muted style={{ fontSize: 11.5 }}>
        gaRAN ne peut pas localiser un téléphone à votre place : ces services fonctionnent avec votre propre compte Google ou Apple.
      </Muted>
    </Card>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: radius.sm, backgroundColor: colors.emeraldSoft, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 12.5, fontWeight: '800', color: colors.emeraldDeep },
  stepText: { flex: 1, fontSize: 13.5, color: colors.ink, lineHeight: 19 }
});
