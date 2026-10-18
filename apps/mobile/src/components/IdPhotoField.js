import { useState } from 'react';
import { Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { api } from '../lib/api';
import { colors, radius } from '../lib/theme';
import { Button, Label, Muted } from './ui';

/**
 * Photo recto ou verso de la pièce d'identité.
 * L'image est redimensionnée (1600 px) et compressée avant envoi pour économiser la data mobile,
 * puis téléversée immédiatement : `onUploaded(key)` reçoit la clé de stockage.
 */
export function IdPhotoField({ label, uploadedKey, onUploaded }) {
  const [uri, setUri] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function take(fromLibrary) {
    setError(null);
    const perm = fromLibrary ? await ImagePicker.requestMediaLibraryPermissionsAsync() : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Autorisation refusée');
      return;
    }
    const opts = { mediaTypes: ['images'], quality: 0.8, allowsEditing: true };
    const res = fromLibrary ? await ImagePicker.launchImageLibraryAsync(opts) : await ImagePicker.launchCameraAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      const asset = res.assets[0];
      const resize = asset.width > 1600 ? [{ resize: { width: 1600 } }] : [];
      const small = await manipulateAsync(asset.uri, resize, { compress: 0.7, format: SaveFormat.JPEG });
      const key = await api.uploadIdPhoto(small.uri);
      setUri(small.uri);
      onUploaded(key);
    } catch (e) {
      setError(e.message ?? 'Échec de l’envoi de la photo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8, flex: 1 }}>
      <Label>{label}</Label>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', aspectRatio: 1.58, borderRadius: radius.md, backgroundColor: colors.line }} accessibilityLabel={label} />
      ) : (
        <View style={{ width: '100%', aspectRatio: 1.58, borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: uploadedKey ? colors.ok : colors.line, alignItems: 'center', justifyContent: 'center' }}>
          <Muted>{uploadedKey ? '✓ Enregistrée' : 'Aucune photo'}</Muted>
        </View>
      )}
      <Button title={uri || uploadedKey ? 'Reprendre' : 'Photographier'} variant="secondary" onPress={() => take(false)} loading={busy} style={{ minHeight: 44 }} />
      <Button title="Galerie" variant="secondary" onPress={() => take(true)} disabled={busy} style={{ minHeight: 40 }} />
      {error ? <Muted style={{ color: colors.danger }}>{error}</Muted> : null}
    </View>
  );
}
