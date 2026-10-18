import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BrandModelPicker } from '../../src/components/BrandModelPicker';
import { IdPhotoField } from '../../src/components/IdPhotoField';
import { ImeiField } from '../../src/components/ImeiField';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Row, Screen, Segmented, Select, Title } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { LABELS, toOptions } from '../../src/lib/format';
import { isValidImei } from '../../src/lib/imei';

const CONFIG = {
  sale: {
    title: 'Vente',
    submit: 'Enregistrer la vente',
    intro: 'Le téléphone sera enregistré au nom de l’acheteur, qui recevra un certificat de propriété.',
    person: 'Acheteur',
    endpoint: '/transactions/sales',
    allowed: (c) => c.can_sell
  },
  purchase: {
    title: 'Rachat',
    submit: 'Enregistrer le rachat',
    intro: 'Le vendeur doit être le propriétaire enregistré du téléphone. Sa pièce d’identité vous protège en cas de contrôle.',
    person: 'Vendeur',
    endpoint: '/transactions/purchases',
    allowed: (c) => c.can_buy
  },
  stock_in: {
    title: 'Entrée en stock',
    submit: 'Enregistrer l’entrée en stock',
    intro: 'Enregistrez un téléphone neuf reçu d’un fournisseur avant sa mise en vente.',
    person: null,
    endpoint: '/transactions/stock-in',
    allowed: (c) => !c.reported && c.ownership === 'none'
  }
};

const CONDITIONS = toOptions(LABELS.condition);
const DOC_TYPES = toOptions(LABELS.docType);

function apiErrorText(e) {
  if (!e) return null;
  if (e.code === 'VALIDATION_ERROR' && e.details?.length) return new Error(e.details.map((d) => `${d.path} : ${d.message}`).join('\n'));
  return e;
}

export default function Operation() {
  const { type = 'sale' } = useLocalSearchParams();
  const cfg = CONFIG[type] ?? CONFIG.sale;
  const { user, isOwner } = useAuth();
  const qc = useQueryClient();

  const activeShops = (user?.shops ?? []).filter((s) => s.status === 'active');
  const [shopId, setShopId] = useState(activeShops.length === 1 ? activeShops[0].id : undefined);

  const [imei1, setImei1] = useState('');
  const [imei2, setImei2] = useState('');
  const [dualSim, setDualSim] = useState(false);
  const [check, setCheck] = useState(null);
  const [device, setDevice] = useState({});

  const [person, setPerson] = useState({ id_doc_type: 'CNI', id_doc_number: '', full_name: '', phone1: '', phone2: '', email: '' });
  const [known, setKnown] = useState(null); // résultat du préremplissage
  const [frontKey, setFrontKey] = useState(null);
  const [backKey, setBackKey] = useState(null);

  const [condition, setCondition] = useState(type === 'stock_in' ? 'new' : type === 'purchase' ? 'used' : 'new');
  const [price, setPrice] = useState('');
  const [supplier, setSupplier] = useState('');

  useEffect(() => setCheck(null), [imei1]);

  const verify = useMutation({
    mutationFn: () => api.get(`/devices/check/${imei1}`),
    onSuccess: setCheck
  });

  const lookup = useMutation({
    mutationFn: () => api.get('/persons/lookup', { id_doc_type: person.id_doc_type, id_doc_number: person.id_doc_number }),
    onSuccess: (r) => {
      setKnown(r);
      if (r.found && !person.full_name) setPerson((p) => ({ ...p, full_name: r.person.full_name }));
    }
  });

  const submit = useMutation({
    mutationFn: () => {
      const body = {
        shop_id: shopId,
        device: {
          imei1,
          imei2: dualSim && imei2 ? imei2 : undefined,
          ...(check?.known ? {} : { ...device, storage_gb: device.storage_gb ? Number(device.storage_gb) : undefined })
        },
        condition,
        price: Number(price || 0)
      };
      if (cfg.person) {
        body.person = { ...person, id_doc_front_key: frontKey ?? undefined, id_doc_back_key: backKey ?? undefined };
      } else {
        body.supplier_name = supplier || undefined;
      }
      return api.post(cfg.endpoint, body);
    },
    onSuccess: (tx) => {
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      router.replace(`/receipt/${tx.id}`);
    }
  });

  const imeiOk = isValidImei(imei1) && (!dualSim || !imei2 || (isValidImei(imei2) && imei2 !== imei1));
  const blocked = check && !cfg.allowed(check);
  const needsDevice = check && !check.known;
  const deviceOk = !needsDevice || (device.brand_id && (device.model_id || device.model_label));
  const docReady = person.id_doc_number.trim().length >= 4;
  const photosOk = (frontKey && backKey) || known?.person?.has_id_photos;
  const personOk = !cfg.person || (docReady && person.full_name.trim() && person.phone1 && person.phone2 && photosOk);
  const canSubmit = check && !blocked && deviceOk && personOk && price !== '' && (shopId || !isOwner || activeShops.length === 1);

  return (
    <Screen>
      <Stack.Screen options={{ title: cfg.title }} />
      <Title sub={cfg.intro}>{cfg.title}</Title>

      {isOwner && activeShops.length > 1 ? (
        <Card>
          <Select label="Magasin" value={shopId} options={activeShops.map((s) => ({ value: s.id, label: s.name, sub: `${s.city}, ${s.district}` }))} onChange={setShopId} />
        </Card>
      ) : null}

      {/* 1. Téléphone */}
      <Card>
        <Muted>1. Téléphone</Muted>
        <ImeiField label="IMEI 1" value={imei1} onChange={setImei1} />
        <Segmented
          value={dualSim ? 'dual' : 'single'}
          onChange={(v) => setDualSim(v === 'dual')}
          options={[{ value: 'single', label: 'Une SIM' }, { value: 'dual', label: 'Double SIM' }]}
        />
        {dualSim ? <ImeiField label="IMEI 2" value={imei2} onChange={setImei2} optional /> : null}
        <Button title="Vérifier dans le registre" onPress={() => verify.mutate()} loading={verify.isPending} disabled={!imeiOk} />
        <ErrorBanner error={verify.error} />
        {check ? (
          <Banner tone={check.reported || blocked ? 'danger' : check.known ? 'ok' : 'info'} title={check.reported ? 'TÉLÉPHONE SIGNALÉ' : blocked ? 'Opération impossible' : 'Vérification OK'}>
            {check.message}
            {check.known && check.brand ? `\n${check.brand} ${check.model ?? ''}` : ''}
          </Banner>
        ) : null}
      </Card>

      {check && !blocked ? (
        <>
          {needsDevice ? (
            <Card>
              <Muted>2. Modèle</Muted>
              <BrandModelPicker value={device} onChange={setDevice} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}><Input label="Couleur" value={device.color ?? ''} onChangeText={(t) => setDevice({ ...device, color: t })} /></View>
                <View style={{ flex: 1 }}><Input label="Stockage (Go)" value={device.storage_gb ?? ''} onChangeText={(t) => setDevice({ ...device, storage_gb: t.replace(/\D/g, '') })} keyboardType="number-pad" /></View>
              </View>
            </Card>
          ) : null}

          {cfg.person ? (
            <Card>
              <Muted>{needsDevice ? '3' : '2'}. {cfg.person}</Muted>
              <Select label="Pièce d’identité" value={person.id_doc_type} options={DOC_TYPES} onChange={(v) => { setPerson({ ...person, id_doc_type: v }); setKnown(null); }} />
              <Input
                label="Numéro de la pièce"
                value={person.id_doc_number}
                autoCapitalize="characters"
                onChangeText={(t) => { setPerson({ ...person, id_doc_number: t }); setKnown(null); }}
                onEndEditing={() => docReady && lookup.mutate()}
                hint={known?.found ? '✓ Personne déjà connue du registre' : undefined}
              />
              {docReady ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <IdPhotoField label="Recto" uploadedKey={frontKey} onUploaded={setFrontKey} />
                    <IdPhotoField label="Verso" uploadedKey={backKey} onUploaded={setBackKey} />
                  </View>
                  {known?.person?.has_id_photos && !(frontKey && backKey) ? (
                    <Muted>Photos déjà au dossier : vous pouvez les mettre à jour si la pièce a changé.</Muted>
                  ) : null}
                  <Input label="Nom complet" value={person.full_name} onChangeText={(t) => setPerson({ ...person, full_name: t })} autoCapitalize="words" />
                  <Input label="Contact 1" value={person.phone1} onChangeText={(t) => setPerson({ ...person, phone1: t })} keyboardType="phone-pad" />
                  <Input label="Contact 2" value={person.phone2} onChangeText={(t) => setPerson({ ...person, phone2: t })} keyboardType="phone-pad" />
                  <Input label="Adresse e-mail (facultatif)" value={person.email} onChangeText={(t) => setPerson({ ...person, email: t })} keyboardType="email-address" autoCapitalize="none" />
                </>
              ) : (
                <Muted>Saisissez le numéro de la pièce pour photographier le recto et le verso.</Muted>
              )}
            </Card>
          ) : null}

          <Card>
            <Muted>Transaction</Muted>
            <Select label="État du téléphone" value={condition} options={CONDITIONS} onChange={setCondition} />
            <Input
              label={type === 'sale' ? 'Prix de vente (FCFA)' : type === 'purchase' ? 'Prix de rachat (FCFA)' : 'Prix d’achat fournisseur (FCFA)'}
              value={price}
              onChangeText={(t) => setPrice(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
            />
            {type === 'stock_in' ? <Input label="Fournisseur (facultatif)" value={supplier} onChangeText={setSupplier} /> : null}
          </Card>

          {cfg.person && person.full_name ? (
            <Card>
              <Muted>Récapitulatif</Muted>
              <Row label="IMEI" value={imei1} mono />
              <Row label={cfg.person} value={person.full_name} />
              <Row label="Pièce" value={`${LABELS.docType[person.id_doc_type]} ${person.id_doc_number}`} />
              <Row label="Montant" value={price ? `${Number(price).toLocaleString('fr-FR')} FCFA` : '—'} />
            </Card>
          ) : null}

          <ErrorBanner error={apiErrorText(submit.error)} />
          <Button title={cfg.submit} onPress={() => submit.mutate()} loading={submit.isPending} disabled={!canSubmit} />
        </>
      ) : null}
    </Screen>
  );
}
