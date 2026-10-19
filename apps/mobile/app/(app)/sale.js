import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrandModelPicker } from '../../src/components/BrandModelPicker';
import { IdPhotoField } from '../../src/components/IdPhotoField';
import { ImeiField } from '../../src/components/ImeiField';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Row, Screen, Segmented, Select } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { fcfa, LABELS, toOptions } from '../../src/lib/format';
import { isValidImei } from '../../src/lib/imei';
import { colors, radius } from '../../src/lib/theme';

const DOC_TYPES = toOptions(LABELS.docType);
const CONDITIONS = toOptions(LABELS.condition);
const STEPS = ['Article', 'Acheteur', 'Paiement'];

function Stepper({ step }) {
  return (
    <View style={st.steps}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <View key={label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={[st.dot, active && st.dotActive, done && st.dotDone]}>
              <Text style={[st.dotText, (active || done) && { color: '#fff' }]}>{done ? '✓' : n}</Text>
            </View>
            <Text style={[st.stepLabel, active && { color: colors.ink, fontWeight: '700' }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function Sale() {
  const { user, isOwner } = useAuth();
  const qc = useQueryClient();
  const orzayahNumber = user?.organization?.orzayah_number;

  const [step, setStep] = useState(1);
  const activeShops = (user?.shops ?? []).filter((s) => s.status === 'active');
  const [shopId, setShopId] = useState(activeShops.length === 1 ? activeShops[0].id : undefined);

  // Étape 1 — article & IMEI
  const avail = useQuery({ queryKey: ['org', 'listings', 'available'], queryFn: () => api.get('/org/listings', { available: '1' }) });
  const [listing, setListing] = useState(null);
  const [imei1, setImei1] = useState('');
  const [imei2, setImei2] = useState('');
  const [dualSim, setDualSim] = useState(false);
  const [device, setDevice] = useState({});
  const verify = useMutation({ mutationFn: () => api.get(`/devices/check/${imei1}`) });
  const check = verify.data; // réinitialisé dès que l'IMEI change (verify.reset())

  // Étape 2 — acheteur
  const [person, setPerson] = useState({ id_doc_type: 'CNI', id_doc_number: '', full_name: '', phone1: '', phone2: '', email: '' });
  const [known, setKnown] = useState(null);
  const [frontKey, setFrontKey] = useState(null);
  const [backKey, setBackKey] = useState(null);
  const lookup = useMutation({
    mutationFn: () => api.get('/persons/lookup', { id_doc_type: person.id_doc_type, id_doc_number: person.id_doc_number }),
    onSuccess: (r) => { setKnown(r); if (r.found && !person.full_name) setPerson((p) => ({ ...p, full_name: r.person.full_name })); }
  });

  // Étape 3 — paiement
  const [condition, setCondition] = useState('new');
  const [price, setPrice] = useState('');
  const [payment, setPayment] = useState('cash');

  function pickListing(l) {
    if (listing?.id === l.id) { setListing(null); return; }
    setListing(l);
    setDevice({ brand_id: l.brand_id, model_id: l.model_id });
    if (!price) setPrice(String(l.price || ''));
  }

  const imeiOk = isValidImei(imei1) && (!dualSim || !imei2 || (isValidImei(imei2) && imei2 !== imei1));
  const blocked = check && !check.can_sell;
  const needsDevice = check && !check.known;
  const deviceOk = !needsDevice || (device.brand_id && (device.model_id || device.model_label));
  const step1Ok = check && !blocked && deviceOk;

  const docReady = person.id_doc_number.trim().length >= 4;
  const photosOk = (frontKey && backKey) || known?.person?.has_id_photos;
  const step2Ok = docReady && person.full_name.trim() && person.phone1 && person.phone2 && photosOk;

  const shopOk = shopId || !isOwner || activeShops.length === 1;
  const step3Ok = price !== '' && shopOk;

  const submit = useMutation({
    mutationFn: async () => {
      const body = {
        shop_id: shopId,
        device: {
          imei1,
          imei2: dualSim && imei2 ? imei2 : undefined,
          ...(check?.known ? {} : { brand_id: device.brand_id, model_id: device.model_id, model_label: device.model_label })
        },
        person: { ...person, id_doc_front_key: frontKey ?? undefined, id_doc_back_key: backKey ?? undefined },
        condition,
        price: Number(price || 0),
        payment_method: payment,
        listing_id: listing?.id
      };
      const tx = await api.post('/transactions/sales', body);
      return tx;
    },
    onSuccess: (tx) => {
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['org', 'listings'] });
      router.replace(`/receipt/${tx.id}`);
    }
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Vente' }} />
      <Stepper step={step} />

      {isOwner && activeShops.length > 1 ? (
        <Card><Select label="Magasin" value={shopId} options={activeShops.map((s) => ({ value: s.id, label: s.name }))} onChange={setShopId} /></Card>
      ) : null}

      {/* ----------------------------- Étape 1 ----------------------------- */}
      {step === 1 ? (
        <>
          {(avail.data?.items?.length ?? 0) > 0 ? (
            <Card>
              <Muted>Depuis la disponibilité (facultatif)</Muted>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
                {avail.data.items.map((l) => (
                  <Pressable key={l.id} onPress={() => pickListing(l)} style={[st.chip, listing?.id === l.id && st.chipOn]}>
                    <Text style={[st.chipTitle, listing?.id === l.id && { color: '#fff' }]} numberOfLines={1}>{l.title}</Text>
                    <Text style={[st.chipSub, listing?.id === l.id && { color: 'rgba(255,255,255,0.9)' }]}>{fcfa(l.price)} · {l.quantity} dispo</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Card>
          ) : null}

          <Card>
            <Muted>Téléphone vendu</Muted>
            <ImeiField label="IMEI 1" value={imei1} onChange={(v) => { setImei1(v); verify.reset(); }} />
            <Segmented value={dualSim ? 'dual' : 'single'} onChange={(v) => setDualSim(v === 'dual')} options={[{ value: 'single', label: 'Une SIM' }, { value: 'dual', label: 'Double SIM' }]} />
            {dualSim ? <ImeiField label="IMEI 2" value={imei2} onChange={setImei2} optional /> : null}
            <Button title="Vérifier dans le registre" onPress={() => verify.mutate()} loading={verify.isPending} disabled={!imeiOk} />
            <ErrorBanner error={verify.error} />
            {check ? (
              <Banner tone={blocked ? 'danger' : check.known ? 'ok' : 'info'} title={check.reported ? 'TÉLÉPHONE SIGNALÉ' : blocked ? 'Vente impossible' : 'Vérification OK'}>
                {check.message}
              </Banner>
            ) : null}
          </Card>

          {check && !blocked && needsDevice && !listing ? (
            <Card>
              <Muted>Modèle du téléphone</Muted>
              <BrandModelPicker value={device} onChange={setDevice} />
            </Card>
          ) : null}

          <Button title="Continuer" onPress={() => setStep(2)} disabled={!step1Ok} />
        </>
      ) : null}

      {/* ----------------------------- Étape 2 ----------------------------- */}
      {step === 2 ? (
        <>
          <Card>
            <Muted>Acheteur</Muted>
            <Select label="Pièce d’identité" value={person.id_doc_type} options={DOC_TYPES} onChange={(v) => { setPerson({ ...person, id_doc_type: v }); setKnown(null); }} />
            <Input
              label="Numéro de la pièce"
              value={person.id_doc_number}
              autoCapitalize="characters"
              onChangeText={(t) => { setPerson({ ...person, id_doc_number: t }); setKnown(null); }}
              onEndEditing={() => docReady && lookup.mutate()}
              hint={known?.found ? '✓ Acheteur déjà connu du registre' : undefined}
            />
            {docReady ? (
              <>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <IdPhotoField label="Recto" uploadedKey={frontKey} onUploaded={setFrontKey} />
                  <IdPhotoField label="Verso" uploadedKey={backKey} onUploaded={setBackKey} />
                </View>
                {known?.person?.has_id_photos && !(frontKey && backKey) ? <Muted>Photos déjà au dossier : mettez-les à jour si la pièce a changé.</Muted> : null}
                <Input label="Nom complet" value={person.full_name} onChangeText={(t) => setPerson({ ...person, full_name: t })} autoCapitalize="words" />
                <Input label="Contact 1" value={person.phone1} onChangeText={(t) => setPerson({ ...person, phone1: t })} keyboardType="phone-pad" />
                <Input label="Contact 2" value={person.phone2} onChangeText={(t) => setPerson({ ...person, phone2: t })} keyboardType="phone-pad" />
                <Input label="E-mail (facultatif)" value={person.email} onChangeText={(t) => setPerson({ ...person, email: t })} keyboardType="email-address" autoCapitalize="none" />
              </>
            ) : <Muted>Saisissez le numéro de la pièce pour photographier le recto et le verso.</Muted>}
          </Card>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button title="Retour" variant="secondary" onPress={() => setStep(1)} /></View>
            <View style={{ flex: 1 }}><Button title="Continuer" onPress={() => setStep(3)} disabled={!step2Ok} /></View>
          </View>
        </>
      ) : null}

      {/* ----------------------------- Étape 3 ----------------------------- */}
      {step === 3 ? (
        <>
          <Card>
            <Muted>Montant et état</Muted>
            <Select label="État du téléphone" value={condition} options={CONDITIONS} onChange={setCondition} />
            <Input label="Prix de vente (FCFA)" value={price} onChangeText={(t) => setPrice(t.replace(/\D/g, ''))} keyboardType="number-pad" />
          </Card>

          <Card>
            <Muted>Mode de paiement</Muted>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setPayment('cash')} style={[st.pay, payment === 'cash' && st.payOn]}>
                <Text style={st.payIcon}>💵</Text>
                <Text style={[st.payTitle, payment === 'cash' && { color: '#fff' }]}>Espèces</Text>
              </Pressable>
              <Pressable onPress={() => setPayment('orzayah')} style={[st.pay, payment === 'orzayah' && st.payOn]}>
                <Text style={st.payIcon}>🟢</Text>
                <Text style={[st.payTitle, payment === 'orzayah' && { color: '#fff' }]}>ORZAYAH</Text>
              </Pressable>
            </View>
            {payment === 'orzayah' ? (
              <Muted>Après validation, le reçu affiche un lien et un QR de paiement ORZAYAH à faire régler par l’acheteur. La vente passe en « payée » dès la confirmation.</Muted>
            ) : null}
          </Card>

          <Card>
            <Muted>Récapitulatif</Muted>
            <Row label="Téléphone" value={check?.known ? `${check.brand ?? ''} ${check.model ?? ''}`.trim() : listing?.title ?? '—'} />
            <Row label="IMEI" value={imei1} mono />
            <Row label="Acheteur" value={person.full_name || '—'} />
            <Row label="Montant" value={price ? fcfa(price) : '—'} />
            <Row label="Paiement" value={payment === 'orzayah' ? 'ORZAYAH' : 'Espèces'} />
          </Card>

          <ErrorBanner error={submit.error} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button title="Retour" variant="secondary" onPress={() => setStep(2)} /></View>
            <View style={{ flex: 2 }}><Button title="Valider la vente" onPress={() => submit.mutate()} loading={submit.isPending} disabled={!step3Ok} /></View>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  steps: { flexDirection: 'row', marginBottom: 4 },
  dot: { width: 30, height: 30, borderRadius: 999, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: colors.blue },
  dotDone: { backgroundColor: colors.ok },
  dotText: { fontWeight: '800', color: colors.ink2 },
  stepLabel: { fontSize: 12, color: colors.ink3 },
  chip: { width: 150, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', gap: 2 },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipTitle: { fontWeight: '700', color: colors.ink },
  chipSub: { fontSize: 12, color: colors.ink2 },
  pay: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  payOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  payIcon: { fontSize: 24 },
  payTitle: { fontWeight: '800', color: colors.ink }
});
