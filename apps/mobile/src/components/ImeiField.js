import { useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { extractImei, isValidImei, normalizeImei } from '../lib/imei';
import { colors } from '../lib/theme';
import { Banner, Button, Input } from './ui';

/** Saisie d'IMEI avec contrôle de Luhn en direct et scan du code-barres. */
export function ImeiField({ label = 'IMEI', value, onChange, optional = false }) {
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanError, setScanError] = useState(null);
  const handled = useRef(false);

  const complete = value?.length === 15;
  const error = complete && !isValidImei(value) ? 'IMEI invalide : vérifiez la saisie (*#06#)' : null;

  async function openScanner() {
    setScanError(null);
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setScanError('Autorisez la caméra pour scanner l’IMEI.');
        return;
      }
    }
    handled.current = false;
    setScanning(true);
  }

  return (
    <View style={{ gap: 6 }}>
      <Input
        label={optional ? `${label} (facultatif)` : label}
        value={value}
        onChangeText={(t) => onChange(normalizeImei(t))}
        keyboardType="number-pad"
        maxLength={15}
        placeholder="15 chiffres"
        error={error ?? scanError}
        hint={complete && !error ? '✓ IMEI valide' : 'Composez *#06# sur le téléphone ou scannez la boîte'}
        right={<Button title="Scanner" variant="secondary" onPress={openScanner} style={{ minHeight: 50 }} />}
      />
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'ean13', 'qr', 'datamatrix', 'pdf417'] }}
            onBarcodeScanned={({ data }) => {
              if (handled.current) return;
              const imei = extractImei(data);
              if (imei) {
                handled.current = true;
                onChange(imei);
                setScanning(false);
              }
            }}
          />
          <View style={st.overlay} pointerEvents="none">
            <View style={st.frame} />
          </View>
          <View style={{ padding: 16, gap: 12 }}>
            <Banner tone="info">Visez le code-barres « IMEI » sur la boîte ou l’étiquette du téléphone.</Banner>
            <Button title="Annuler" variant="secondary" onPress={() => setScanning(false)} />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '80%', height: 140, borderWidth: 3, borderColor: colors.cyan, borderRadius: 12 }
});

