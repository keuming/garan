import { useState } from 'react';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Screen, Select, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';

const COUNTRIES = [
  "Côte d'Ivoire", 'Burkina Faso', 'Mali', 'Sénégal', 'Togo', 'Bénin', 'Niger', 'Guinée', 'Cameroun', 'Gabon'
].map((c) => ({ value: c, label: c }));

export default function Register() {
  const { register } = useAuth();
  const [f, setF] = useState({
    country: "Côte d'Ivoire", city: '', district: '', shop_name: '', contact_phone: '', email: '', rccm: '',
    login_phone: '', pin: '', pin_confirm: ''
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });

  const pinMismatch = f.pin_confirm.length === 4 && f.pin !== f.pin_confirm;
  const ready =
    f.city && f.district && f.shop_name && f.contact_phone && f.email && f.rccm && f.login_phone && f.pin.length === 4 && f.pin === f.pin_confirm;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { pin_confirm: _ignored, ...payload } = f;
      await register(payload);
    } catch (e) {
      setError(e.details?.length ? new Error(e.details.map((d) => d.message).join(' · ')) : e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title sub="Votre magasin est opérationnel immédiatement, avec une période d’essai gratuite.">Inscription</Title>
      <ErrorBanner error={error} />
      <Card>
        <Muted>Localisation</Muted>
        <Select label="Pays" value={f.country} options={COUNTRIES} onChange={set('country')} />
        <Input label="Ville" value={f.city} onChangeText={set('city')} placeholder="Abidjan" />
        <Input label="Quartier" value={f.district} onChangeText={set('district')} placeholder="Adjamé" />
      </Card>
      <Card>
        <Muted>Magasin</Muted>
        <Input label="Nom du magasin" value={f.shop_name} onChangeText={set('shop_name')} />
        <Input label="Contact du magasin" value={f.contact_phone} onChangeText={set('contact_phone')} keyboardType="phone-pad" />
        <Input label="Adresse e-mail" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <Input label="Numéro RCCM" value={f.rccm} onChangeText={set('rccm')} autoCapitalize="characters" placeholder="CI-ABJ-2026-B-00000" />
      </Card>
      <Card>
        <Muted>Identifiants de connexion</Muted>
        <Input label="Login (numéro de téléphone)" value={f.login_phone} onChangeText={set('login_phone')} keyboardType="phone-pad" />
        <Input label="Code PIN (4 chiffres)" value={f.pin} onChangeText={(t) => set('pin')(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} />
        <Input
          label="Confirmer le code PIN"
          value={f.pin_confirm}
          onChangeText={(t) => set('pin_confirm')(t.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
          error={pinMismatch ? 'Les codes PIN ne correspondent pas' : null}
        />
      </Card>
      <Banner tone="info">Ne communiquez jamais votre code PIN. Vous pourrez créer des comptes séparés pour vos vendeurs.</Banner>
      <Button title="Créer mon compte" onPress={submit} loading={busy} disabled={!ready} />
    </Screen>
  );
}
