import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Screen, Select, Title } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';

const COUNTRIES = ["Côte d'Ivoire", 'Burkina Faso', 'Mali', 'Sénégal', 'Togo', 'Bénin', 'Niger', 'Guinée', 'Cameroun', 'Gabon'].map((c) => ({ value: c, label: c }));
const LABEL = { consumer: 'Usager', merchant: 'Marchand', super_merchant: 'Super marchand' };

/* ------------------------------ Usager ------------------------------ */
function ConsumerRegister() {
  const { registerConsumer } = useAuth();
  const [f, setF] = useState({ full_name: '', phone: '', email: '', pin: '', pin2: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const mismatch = f.pin2.length === 4 && f.pin !== f.pin2;
  const ready = f.full_name && f.phone.length >= 8 && f.pin.length === 4 && f.pin === f.pin2;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await registerConsumer({ full_name: f.full_name, phone: f.phone, email: f.email || undefined, pin: f.pin });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Title sub="Créez votre compte pour enregistrer et protéger vos téléphones.">Compte usager</Title>
      <ErrorBanner error={error} />
      <Card>
        <Input label="Nom et prénoms" value={f.full_name} onChangeText={set('full_name')} autoCapitalize="words" />
        <Input label="Numéro de téléphone (identifiant)" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <Input label="Adresse e-mail (facultatif)" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Input label="Code PIN (4 chiffres)" value={f.pin} onChangeText={(t) => set('pin')(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} />
        <Input label="Confirmer le code PIN" value={f.pin2} onChangeText={(t) => set('pin2')(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} error={mismatch ? 'Les codes PIN ne correspondent pas' : null} />
        <Button title="Créer mon compte" onPress={submit} loading={busy} disabled={!ready} />
      </Card>
    </Screen>
  );
}

/* --------------------- Marchand / Super marchand --------------------- */
function MerchantRegister({ type }) {
  const { registerMerchant } = useAuth();
  const [f, setF] = useState({ country: "Côte d'Ivoire", city: '', district: '', shop_name: '', contact_phone: '', email: '', rccm: '', login_phone: '', pin: '', pin2: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const mismatch = f.pin2.length === 4 && f.pin !== f.pin2;
  const ready = f.city && f.district && f.shop_name && f.contact_phone && f.email && f.rccm && f.login_phone && f.pin.length === 4 && f.pin === f.pin2;
  const superM = type === 'super_merchant';

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { pin2, ...payload } = f;
      await registerMerchant(type, payload);
    } catch (e) {
      setError(e.details?.length ? new Error(e.details.map((d) => d.message).join(' · ')) : e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Title sub={superM ? 'Votre entreprise de grossiste. Vous ajouterez ensuite vos sous-marchands.' : 'Votre boutique est opérationnelle immédiatement, avec une période d’essai gratuite.'}>
        {superM ? 'Compte super marchand' : 'Compte marchand'}
      </Title>
      <ErrorBanner error={error} />
      <Card>
        <Muted>Localisation</Muted>
        <Select label="Pays" value={f.country} options={COUNTRIES} onChange={set('country')} />
        <Input label="Ville" value={f.city} onChangeText={set('city')} />
        <Input label="Quartier" value={f.district} onChangeText={set('district')} />
      </Card>
      <Card>
        <Muted>{superM ? 'Entreprise' : 'Boutique'}</Muted>
        <Input label={superM ? 'Raison sociale' : 'Nom de la boutique'} value={f.shop_name} onChangeText={set('shop_name')} />
        <Input label="Contact" value={f.contact_phone} onChangeText={set('contact_phone')} keyboardType="phone-pad" />
        <Input label="Adresse e-mail" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Input label="Numéro RCCM" value={f.rccm} onChangeText={set('rccm')} autoCapitalize="characters" placeholder="CI-ABJ-2026-B-00000" />
      </Card>
      <Card>
        <Muted>Identifiants de connexion</Muted>
        <Input label="Login (numéro de téléphone)" value={f.login_phone} onChangeText={set('login_phone')} keyboardType="phone-pad" />
        <Input label="Code PIN (4 chiffres)" value={f.pin} onChangeText={(t) => set('pin')(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} />
        <Input label="Confirmer le code PIN" value={f.pin2} onChangeText={(t) => set('pin2')(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} error={mismatch ? 'Les codes PIN ne correspondent pas' : null} />
      </Card>
      <Banner tone="info">Ne communiquez jamais votre code PIN.</Banner>
      <Button title="Créer mon compte" onPress={submit} loading={busy} disabled={!ready} />
    </Screen>
  );
}

export default function Register() {
  const { profile = 'consumer' } = useLocalSearchParams();
  if (profile === 'consumer') return <ConsumerRegister />;
  return <MerchantRegister type={profile === 'super_merchant' ? 'super_merchant' : 'merchant'} />;
}
